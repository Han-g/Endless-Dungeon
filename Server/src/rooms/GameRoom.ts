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

        // 50ms = 초당 20번 서버 시뮬레이션
        this.setSimulationInterval(
            (deltaTimeMilliseconds) => {
                this.simulation.update(
                    deltaTimeMilliseconds
                );
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