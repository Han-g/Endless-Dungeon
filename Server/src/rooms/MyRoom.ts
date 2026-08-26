import { Room, Client, CloseCode } from "colyseus";
import { MyRoomState } from "./schema/MyRoomState.js";
import { PlayerState } from "./schema/PlayerState.js";

export class MyRoom extends Room {
    state = new MyRoomState();
    maxClients = 4;

    messages = {
        yourMessageType: (client: Client, message: any) => {
            /**
             * Handle "yourMessageType" message.
             */
            console.log(client.sessionId, "sent a message:", message);
        }
    }

    onCreate(options: unknown) {
        this.state.maxPlayers =
            this.maxClients;

        console.log(
            `[Room Created] ${this.roomId}`);
    }

    onJoin(
        client: Client,
        options: any
    ) {
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

        const player =
            new PlayerState();

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
            player);

        if (
            this.state.hostSessionId === ""
        ) {
            this.state.hostSessionId =
                client.sessionId;
        }

        console.log(
            `[Room ${this.roomId}] ` +
            `${client.sessionId} joined, ` +
            `players=${this.state.players.size}`
        );
    }

    onLeave(
        client: Client,
        code: CloseCode
    ) {
        this.state.players.delete(
            client.sessionId);

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
            `[Room ${this.roomId}] ` +
            `${client.sessionId} left, ` +
            `players=${this.state.players.size}, ` +
            `code=${code}`
        );
    }

    onDispose() {
        console.log(
            `[Room Disposed] ${this.roomId}`);
    }
}