import { MyRoomState } from "../rooms/schema/MyRoomState.js";
import { MapCollision } from "./MapCollision.js";

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

const MAX_DELTA_SECONDS = 0.1;
const MAX_INPUT_SEQUENCE = 0xffffffff;

export class PlayerSystem {
    private readonly moveInputs =
        new Map<string, StoredMoveInput>();

    public constructor(
        private readonly state: MyRoomState,
        private readonly mapCollision: MapCollision
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

                const previousX = player.x;
                const previousY = player.y;

                const next = this.mapCollision.move(
                    previousX,
                    previousY,
                    input.x * player.moveSpeed * deltaSeconds,
                    input.y * player.moveSpeed * deltaSeconds
                );

                player.x = next.x;
                player.y = next.y;

                // 벽에 막힌 결과까지 반영한 실제 이동 속도를 전송합니다.
                player.velocityX = deltaSeconds > 0
                    ? (player.x - previousX) / deltaSeconds
                    : 0;

                player.velocityY = deltaSeconds > 0
                    ? (player.y - previousY) / deltaSeconds
                    : 0;

                player.lastProcessedInput =
                    input.sequence;
            }
        );
    }

    public removePlayer(sessionId: string): void {
        this.moveInputs.delete(sessionId);
    }
}