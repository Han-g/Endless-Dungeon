import {
    Room,
    Client,
    CloseCode
} from "colyseus";

import { MyRoomState } from
    "./schema/MyRoomState.js";

import { PlayerState } from
    "./schema/PlayerState.js";

import { GameSimulation } from
    "../simulation/GameSimulation.js";

export class GameRoom extends Room<{ state: MyRoomState; }>
{
    public state = new MyRoomState();

    public maxClients = 4;

    // 이동 20회 + 이후 공격 메시지까지 고려
    public maxMessagesPerSecond = 60;

    private simulation!: GameSimulation;

    public messages = {
        "input/move": (
            client: Client,
            message: unknown
        ) => {
            this.simulation.playerSystem.setMoveInput(
                client.sessionId,
                message
            );
        },

        "input/attack": (
            client: Client,
            message: unknown
        ) => {
            this.simulation.projectileSystem
                .setAttackInput(
                    client.sessionId,
                    message);
        }
    };

    public onCreate(options: unknown): void {
        this.state.maxPlayers =
            this.maxClients;

        this.simulation =
            new GameSimulation(this.state);

        this.setSimulationInterval(
            (deltaTimeMilliseconds) => {
                const wasFinished =
                    this.state.game.phase === "finished";

                this.simulation.update(deltaTimeMilliseconds);

                if (
                    !wasFinished &&
                    this.state.game.phase === "finished"
                ) {
                    // 정원 도달로 자동 잠금된 방이라도
                    // 종료 시에는 명시적으로 잠급니다.
                    void this.lock().catch((error) => {
                        console.error(
                            "[GameRoom] 종료된 방 잠금 실패",
                            error
                        );
                    });
                }
            },
            50
        );

        console.log(
            `[GameRoom Created] ${this.roomId}`
        );
    }

    public onJoin(
        client: Client,
        options: any
    ): void {
        if (this.state.game.phase === "finished") {
            throw new Error("이미 종료된 게임입니다.");
        }

        const spawnPoints = [
            { x: -2, y: 0 },
            { x: 2, y: 0 },
            { x: 0, y: 2 },
            { x: 0, y: -2 }
        ];

        const spawnIndex =
            this.state.players.size %
            spawnPoints.length;

        const spawnPoint =
            spawnPoints[spawnIndex];

        if (
            !this.simulation.mapCollision.canStand(
                spawnPoint.x,
                spawnPoint.y
            )
        ) {
            throw new Error(
                "Player spawn is inside an obstacle."
            );
        }

        const player = new PlayerState();

        const requestedCharacterId =
            Number(options?.characterId);

        player.characterId =
            Number.isInteger(requestedCharacterId) &&
                requestedCharacterId >= 1 &&
                requestedCharacterId <= 4
                ? requestedCharacterId
                : 1;

        player.name =
            typeof options?.playerName === "string"
                ? options.playerName
                : "Player";

        player.x = spawnPoint.x;
        player.y = spawnPoint.y;

        player.velocityX = 0;
        player.velocityY = 0;

        player.hp = 100;
        player.maxHp = 100;
        player.alive = true;

        // 게임 시작 버튼을 눌렀을 때 전환하게 수정
        if (this.state.game.phase === "waiting") {
            this.state.game.phase = "playing";
            this.state.game.elapsedSeconds = 0;
            this.state.game.seed = Date.now() & 0x7fffffff;
        }

        this.state.players.set(
            client.sessionId,
            player
        );

        if (this.state.hostSessionId === "") {
            this.state.hostSessionId =
                client.sessionId;
        }

        console.log(
            `[GameRoom ${this.roomId}] ` +
            `${client.sessionId} joined`
        );
    }

    public onLeave(
        client: Client,
        code: CloseCode
    ): void {
        this.simulation.removePlayer(
            client.sessionId
        );

        this.state.players.delete(
            client.sessionId
        );

        if (
            this.state.hostSessionId ===
            client.sessionId
        ) {
            const nextHost =
                this.state.players
                    .keys()
                    .next()
                    .value;

            this.state.hostSessionId =
                nextHost ?? "";
        }

        console.log(
            `[GameRoom ${this.roomId}] ` +
            `${client.sessionId} left, code=${code}`
        );
    }

    public onDispose(): void {
        console.log(
            `[GameRoom Disposed] ${this.roomId}`
        );
    }
}