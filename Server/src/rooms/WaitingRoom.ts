import {
    Room,
    Client,
    ServerError
} from "colyseus";

import { performance } from "node:perf_hooks";

import { ClockTimer } from "@colyseus/timer";

import { authRuntime } from "../auth/runtime.js";

import type { UserProfile } from "../auth/contracts.js";

import { MyRoomState } from "./schema/MyRoomState.js";

import { PlayerState } from "./schema/PlayerState.js";

import { GameSimulation } from "../simulation/GameSimulation.js";

import {
    ReadyRules,
    type RoomFailure
} from "./ReadyRules.js";

interface WaitingRoomMetadata {
    title: string;
    phase: string;
}

interface RoomCommand {
    requestId: string;
    ready?: unknown;
    characterId?: unknown;
}

class MonotonicRoomClock extends ClockTimer {
    public constructor() {
        super(false);

        this.now = () => performance.now();

        this.start(false);
    }
}

function readTitle(options: unknown): string {
    const value =
        typeof options === "object" && options !== null
            ? (options as { roomTitle?: unknown }).roomTitle
            : undefined;

    if (typeof value !== "string") {
        return "함께하는 던전";
    }

    const title = value.trim();

    if (
        title.length >= 1 &&
        title.length <= 32 &&
        !/[\u0000-\u001f\u007f]/.test(title)
    ) {
        return title;
    }

    return "함께하는 던전";
}

export class WaitingRoom extends Room<{
    state: MyRoomState;
    metadata: WaitingRoomMetadata;
}> {
    public override clock = new MonotonicRoomClock();

    public state = new MyRoomState();

    public maxClients = 4;

    public maxMessagesPerSecond = 120;

    private simulation!: GameSimulation;

    private rules!: ReadyRules;

    private readonly spawnSlots = new Map<string, number>();

    private loadingTimeout?: ReturnType<ClockTimer["setTimeout"]>;

    public static async onAuth(
        token: string
    ): Promise<UserProfile> {
        try {
            return await authRuntime.service.me(token);
        } catch {
            throw new ServerError(
                401,
                "로그인이 필요합니다."
            );
        }
    }

    public messages = {
        "room/ready": (
            client: Client,
            message: unknown
        ): void => {
            this.command(client, message, data =>
                this.rules.setReady(
                    client.sessionId,
                    data.ready,
                    data.characterId
                )
            );
        },

        "room/character": (
            client: Client,
            message: unknown
        ): void => {
            this.command(client, message, data =>
                this.rules.selectCharacter(
                    client.sessionId,
                    data.characterId
                )
            );
        },

        "room/start": (
            client: Client,
            message: unknown
        ): void => {
            this.command(client, message, () =>
                this.rules.requestStart(client.sessionId)
            );
        },

        "game/loaded": (
            client: Client,
            message: unknown
        ): void => {
            this.command(client, message, () =>
                this.rules.reportLoaded(client.sessionId)
            );
        },

        "input/move": (
            client: Client,
            message: unknown
        ): void => {
            if (this.state.game.phase !== "playing") {
                return;
            }

            this.simulation.playerSystem.setMoveInput(
                client.sessionId,
                message
            );
        },

        "input/attack": (
            client: Client,
            message: unknown
        ): void => {
            if (this.state.game.phase !== "playing") {
                return;
            }

            this.simulation.projectileSystem.setAttackInput(
                client.sessionId,
                message
            );
        }
    };

    public onCreate(options: unknown): void {
        this.state.maxPlayers = this.maxClients;

        this.state.game.phase = "waiting";

        this.metadata = {
            title: readTitle(options),
            phase: "waiting"
        };

        this.rules = new ReadyRules(this.state);

        this.simulation = new GameSimulation(this.state);

        this.setSimulationInterval(deltaTime => {
            // 현재 GameSimulation은 waiting도 자동 시작한다.
            // 따라서 playing일 때만 호출한다.
            if (this.state.game.phase !== "playing") {
                return;
            }

            const previous = this.state.game.phase;

            this.simulation.update(deltaTime);

            this.syncPhase(previous);
        }, 50);
    }

    public onJoin(client: Client): void {
        if (this.state.game.phase !== "waiting") {
            throw new ServerError(
                409,
                "이미 시작된 방입니다."
            );
        }

        const user =
            client.auth as UserProfile | undefined;

        if (!user) {
            throw new ServerError(
                401,
                "로그인이 필요합니다."
            );
        }

        const points = [
            { x: -2, y: 0 },
            { x: 2, y: 0 },
            { x: 0, y: 2 },
            { x: 0, y: -2 }
        ];

        const used = new Set(this.spawnSlots.values());

        const index = points.findIndex(
            (_, position) => !used.has(position)
        );

        if (index < 0) {
            throw new ServerError(
                409,
                "방이 가득 찼습니다."
            );
        }

        const point = points[index];

        if (
            !this.simulation.mapCollision.canStand(
                point.x,
                point.y
            )
        ) {
            throw new ServerError(
                500,
                "플레이어 생성 위치를 확인하세요."
            );
        }

        const player = new PlayerState();

        player.name = user.displayName;
        player.characterId = user.selectedCharacterId;
        player.isReady = false;
        player.x = point.x;
        player.y = point.y;

        this.spawnSlots.set(client.sessionId, index);

        this.state.players.set(
            client.sessionId,
            player
        );

        if (this.state.hostSessionId === "") {
            this.state.hostSessionId = client.sessionId;
        }
    }

    public onLeave(client: Client): void {
        const previous = this.state.game.phase;

        this.simulation.removePlayer(client.sessionId);

        this.state.players.delete(client.sessionId);

        this.spawnSlots.delete(client.sessionId);

        if (
            this.state.hostSessionId === client.sessionId
        ) {
            this.state.hostSessionId =
                this.state.players.keys().next().value ?? "";
        }

        this.rules.memberLeft(client.sessionId);

        this.syncPhase(previous);
    }

    public onDispose(): void {
        this.loadingTimeout?.clear();
    }

    private command(
        client: Client,
        message: unknown,
        execute: (data: RoomCommand) => RoomFailure | null
    ): void {
        if (
            typeof message !== "object" ||
            message === null
        ) {
            return;
        }

        const data = message as Partial<RoomCommand>;

        if (
            typeof data.requestId !== "string" ||
            !/^[a-f0-9]{32}$/.test(data.requestId)
        ) {
            return;
        }

        const previous = this.state.game.phase;

        const failure = execute(data as RoomCommand);

        client.send("room/result", {
            requestId: data.requestId,
            ok: failure === null,
            error: failure ?? ""
        });

        this.syncPhase(previous);
    }

    private syncPhase(previous: string): void {
        const phase = this.state.game.phase;

        if (previous === phase) {
            return;
        }

        this.metadata = {
            title: this.metadata.title,
            phase
        };

        if (
            phase === "loading" ||
            phase === "finished"
        ) {
            void this.lock().catch(() => {
                console.warn("[WaitingRoom] LOCK_FAILED");
            });
        }

        if (phase === "loading") {
            this.loadingTimeout?.clear();

            this.loadingTimeout = this.clock.setTimeout(
                () => {
                    if (
                        this.state.game.phase !== "loading"
                    ) {
                        return;
                    }

                    const missing = new Set(
                        this.rules.unloadedMembers()
                    );

                    for (const member of [...this.clients]) {
                        if (
                            missing.has(member.sessionId)
                        ) {
                            member.leave(4000);
                        }
                    }
                },
                30000
            );
        }

        if (phase === "playing") {
            this.loadingTimeout?.clear();

            this.state.game.elapsedSeconds = 0;

            this.state.game.seed =
                Date.now() & 0x7fffffff;
        }
    }
}