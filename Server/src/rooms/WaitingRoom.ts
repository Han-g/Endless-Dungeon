import { Room, Client, ServerError } from "colyseus";
import { performance } from "node:perf_hooks";
import { ClockTimer } from "@colyseus/timer";
import {
    authRuntime, authForRoom, claimGameAccount, releaseGameAccount
} from "../auth/runtime.js";
import { MyRoomState } from "./schema/MyRoomState.js";
import { PlayerState } from "./schema/PlayerState.js";
import { GameSimulation } from "../simulation/GameSimulation.js";
import { ReadyRules, type RoomFailure } from "./ReadyRules.js";

interface WaitingRoomMetadata {
    title: string;
    phase: string;
}

interface RoomCommand {
    requestId: string;
    ready?: unknown;
    characterId?: unknown;
}

interface CommandResult {
    requestId: string;
    ok: boolean;
    error: string;
}

interface CachedCommand {
    fingerprint: string;
    result: CommandResult;
}

interface Member {
    accountId: string;
    detachAuth: () => void;
}

class MonotonicRoomClock extends ClockTimer {
    public constructor() {
        super(false);
        this.now = () => performance.now();
        this.start(false);
    }
}

function readTitle(options: unknown): string {
    const title = typeof options === "object" && options !== null
        ? (options as { roomTitle?: unknown }).roomTitle
        : undefined;
    if (typeof title !== "string") return "함께하는 던전";
    const value = title.trim();
    return value.length >= 1 && value.length <= 32 &&
        !/[<>\u0000-\u001f\u007f]/.test(value)
        ? value : "함께하는 던전";
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
    private roomTitle = "";
    private disposed = false;
    private listingUpdates: Promise<void> = Promise.resolve();
    private loadingTimeout?: ReturnType<ClockTimer["setTimeout"]>;
    private readonly spawnSlots = new Map<string, number>();
    private readonly members = new Map<string, Member>();
    private readonly commandCache = new Map<string, Map<string, CachedCommand>>();

    public static async onAuth(token: string) {
        return authForRoom(() => authRuntime.service.authenticate(token));
    }

    public messages = {
        "room/ready": (client: Client, message: unknown): void => {
            this.command(client, "room/ready", message, data =>
                this.rules.setReady(client.sessionId, data.ready, data.characterId));
        },
        "room/character": (client: Client, message: unknown): void => {
            this.command(client, "room/character", message, data =>
                this.rules.selectCharacter(client.sessionId, data.characterId));
        },
        "room/start": (client: Client, message: unknown): void => {
            this.command(client, "room/start", message, () =>
                this.rules.requestStart(client.sessionId));
        },
        "game/loaded": (client: Client, message: unknown): void => {
            this.command(client, "game/loaded", message, () =>
                this.rules.reportLoaded(client.sessionId));
        },
        "input/move": (client: Client, message: unknown): void => {
            if (!this.isAuthorized(client) || this.state.game.phase !== "playing") return;
            this.simulation.playerSystem.setMoveInput(client.sessionId, message);
        },
        "input/attack": (client: Client, message: unknown): void => {
            if (!this.isAuthorized(client) || this.state.game.phase !== "playing") return;
            this.simulation.projectileSystem.setAttackInput(client.sessionId, message);
        }
    };

    public onCreate(options: unknown): void {
        this.roomTitle = readTitle(options);
        this.state.maxPlayers = this.maxClients;
        this.state.game.phase = "waiting";
        // onCreate의 초기 설정에서는 metadata setter를 사용할 수 있습니다.
        this.metadata = { title: this.roomTitle, phase: "waiting" };
        this.rules = new ReadyRules(this.state);
        this.simulation = new GameSimulation(this.state);

        this.setSimulationInterval(deltaTime => {
            if (this.state.game.phase !== "playing") return;
            const previous = this.state.game.phase;
            this.simulation.update(deltaTime);
            this.syncPhase(previous);
        }, 50);
    }

    public onJoin(client: Client): void {
        if (this.state.game.phase !== "waiting") {
            throw new ServerError(409, "이미 시작된 방입니다.");
        }
        const user = authForRoom(() => authRuntime.service.requireIdentity(client.auth));
        const points = [
            { x: -2, y: 0 }, { x: 2, y: 0 },
            { x: 0, y: 2 }, { x: 0, y: -2 }
        ];
        const used = new Set(this.spawnSlots.values());
        const index = points.findIndex((_, position) => !used.has(position));
        if (index < 0) throw new ServerError(409, "방이 가득 찼습니다.");
        const point = points[index];
        if (!this.simulation.mapCollision.canStand(point.x, point.y)) {
            throw new ServerError(500, "플레이어 생성 위치를 확인하세요.");
        }

        if (!claimGameAccount(user.accountId, this.roomId, client.sessionId)) {
            throw new ServerError(409, "이미 게임방에 참가 중인 계정입니다.");
        }

        let detachAuth: (() => void) | undefined;
        try {
            detachAuth = authForRoom(() => authRuntime.service.watch(
                client.auth, () => client.leave(4401)
            ));
            const player = new PlayerState();
            player.name = user.displayName;
            player.characterId = user.selectedCharacterId;
            player.isReady = false;
            player.x = point.x;
            player.y = point.y;

            this.members.set(client.sessionId, { accountId: user.accountId, detachAuth });
            this.spawnSlots.set(client.sessionId, index);
            this.state.players.set(client.sessionId, player);
            if (this.state.hostSessionId === "") this.state.hostSessionId = client.sessionId;
        } catch (error) {
            detachAuth?.();
            releaseGameAccount(user.accountId, this.roomId, client.sessionId);
            this.members.delete(client.sessionId);
            this.spawnSlots.delete(client.sessionId);
            this.state.players.delete(client.sessionId);
            throw error;
        }
    }

    public onLeave(client: Client): void {
        const previous = this.state.game.phase;
        this.releaseMember(client.sessionId);
        this.commandCache.delete(client.sessionId);
        this.simulation.removePlayer(client.sessionId);
        this.state.players.delete(client.sessionId);
        this.spawnSlots.delete(client.sessionId);
        if (this.state.hostSessionId === client.sessionId) {
            this.state.hostSessionId = this.state.players.keys().next().value ?? "";
        }
        this.rules.memberLeft(client.sessionId);
        this.syncPhase(previous);
    }

    public onDispose(): void {
        this.disposed = true;
        this.loadingTimeout?.clear();
        for (const sessionId of [...this.members.keys()]) this.releaseMember(sessionId);
        this.commandCache.clear();
        this.spawnSlots.clear();
    }

    private releaseMember(sessionId: string): void {
        const member = this.members.get(sessionId);
        if (!member) return;
        this.members.delete(sessionId);
        member.detachAuth();
        releaseGameAccount(member.accountId, this.roomId, sessionId);
    }

    private isAuthorized(client: Client): boolean {
        if (!this.members.has(client.sessionId)) return false;
        try {
            authRuntime.service.requireIdentity(client.auth);
            return true;
        } catch {
            client.leave(4401);
            return false;
        }
    }

    private command(
        client: Client,
        kind: string,
        message: unknown,
        execute: (data: RoomCommand) => RoomFailure | null
    ): void {
        if (!this.isAuthorized(client)) return;
        if (typeof message !== "object" || message === null || Array.isArray(message)) {
            client.leave(4400);
            return;
        }
        const data = message as Partial<RoomCommand>;
        if (typeof data.requestId !== "string" || !/^[a-f0-9]{32}$/.test(data.requestId)) {
            client.leave(4400);
            return;
        }

        // 유효한 입력 타입만 정규화해서 비교합니다.
        const fingerprint = JSON.stringify([
            kind,
            typeof data.ready === "boolean" ? data.ready : null,
            typeof data.characterId === "number" ? data.characterId : null
        ]);
        let cache = this.commandCache.get(client.sessionId);
        if (!cache) {
            cache = new Map();
            this.commandCache.set(client.sessionId, cache);
        }
        const cached = cache.get(data.requestId);
        if (cached) {
            client.send("room/result", cached.fingerprint === fingerprint
                ? cached.result
                : { requestId: data.requestId, ok: false, error: "REQUEST_ID_REUSED" });
            return;
        }

        const previous = this.state.game.phase;
        const failure = execute(data as RoomCommand);
        this.syncPhase(previous);
        const result: CommandResult = {
            requestId: data.requestId, ok: failure === null, error: failure ?? ""
        };
        cache.set(data.requestId, { fingerprint, result });
        if (cache.size > 128) {
            const oldest = cache.keys().next().value;
            if (oldest !== undefined) cache.delete(oldest);
        }
        client.send("room/result", result);
    }

    private syncPhase(previous: string): void {
        const phase = this.state.game.phase;
        if (previous === phase || this.disposed) return;

        if (phase === "loading" || phase === "finished") {
            // 정원 때문에 이미 잠겼어도 명시적 잠금으로 바꿉니다.
            void this.lock().catch(() => this.failRoom());
        }

        // loading → playing 게시 순서를 보존합니다.
        this.listingUpdates = this.listingUpdates
            .then(async () => {
                if (!this.disposed) {
                    await this.setMetadata({ title: this.roomTitle, phase });
                }
            })
            .catch(() => this.failRoom());

        if (phase === "loading") {
            this.loadingTimeout?.clear();
            this.loadingTimeout = this.clock.setTimeout(() => {
                if (this.state.game.phase !== "loading") return;
                const missing = new Set(this.rules.unloadedMembers());
                for (const member of [...this.clients]) {
                    if (missing.has(member.sessionId)) member.leave(4408);
                }
                // 실제 퇴장 처리는 onLeave에서 수행합니다.
                // 남은 전원이 loaded이면 ReadyRules가 playing으로 전환합니다.
            }, 30000);
        }

        if (phase === "playing") {
            this.loadingTimeout?.clear();
            this.state.game.elapsedSeconds = 0;
            this.state.game.seed = Date.now() & 0x7fffffff;
        }
        if (phase === "finished") this.loadingTimeout?.clear();
    }

    private failRoom(): void {
        if (this.disposed) return;
        console.error("[WaitingRoom] MATCHMAKING_UPDATE_FAILED");
        void this.disconnect().catch((): void => {
            console.error("[WaitingRoom] DISCONNECT_FAILED");
        });
    }
}
