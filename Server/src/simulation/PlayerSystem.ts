import { MyRoomState } from "../rooms/schema/MyRoomState.js";

export interface MoveInputMessage {
    x: number;
    y: number;
    sequence: number;
}

interface StoredMoveInput {
    x: number;
    y: number;
    sequence: number;
}

const PLAYER_MOVE_SPEED = 5;
const MAX_DELTA_SECONDS = 0.1;
const MAX_INPUT_SEQUENCE = 0xffffffff;

export class PlayerSystem {
    private readonly moveInputs =
        new Map<string, StoredMoveInput>();

    public constructor(
        private readonly state: MyRoomState
    ) {
    }

    public setMoveInput(
        sessionId: string,
        message: unknown
    ): void {
        if (
            typeof message !== "object" ||
            message === null
        ) {
            return;
        }

        const input =
            message as Partial<MoveInputMessage>;

        const x = Number(input.x);
        const y = Number(input.y);
        const sequence = Number(input.sequence);

        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            !Number.isInteger(sequence) ||
            sequence < 0 ||
            sequence > MAX_INPUT_SEQUENCE
        ) {
            return;
        }

        const player =
            this.state.players.get(sessionId);

        if (player === undefined || !player.alive) {
            return;
        }

        const previous =
            this.moveInputs.get(sessionId);

        if (
            previous !== undefined &&
            sequence <= previous.sequence
        ) {
            return;
        }

        let normalizedX = x;
        let normalizedY = y;

        const magnitude =
            Math.hypot(normalizedX, normalizedY);

        if (!Number.isFinite(magnitude)) {
            return;
        }

        if (magnitude > 1) {
            normalizedX /= magnitude;
            normalizedY /= magnitude;
        }

        this.moveInputs.set(
            sessionId,
            {
                x: normalizedX,
                y: normalizedY,
                sequence
            }
        );
    }

    public update(deltaTimeMilliseconds: number): void {
        const deltaSeconds = Math.min(
            Math.max(
                deltaTimeMilliseconds / 1000,
                0
            ),
            MAX_DELTA_SECONDS
        );

        this.state.players.forEach(
            (player, sessionId) => {
                if (!player.alive) {
                    player.velocityX = 0;
                    player.velocityY = 0;
                    return;
                }

                const input =
                    this.moveInputs.get(sessionId);

                if (input === undefined) {
                    player.velocityX = 0;
                    player.velocityY = 0;
                    return;
                }

                player.velocityX =
                    input.x * PLAYER_MOVE_SPEED;

                player.velocityY =
                    input.y * PLAYER_MOVE_SPEED;

                player.x +=
                    player.velocityX * deltaSeconds;

                player.y +=
                    player.velocityY * deltaSeconds;

                player.lastProcessedInput =
                    input.sequence;
            }
        );
    }

    public removePlayer(sessionId: string): void {
        this.moveInputs.delete(sessionId);
    }
}