import { MyRoomState } from "../rooms/schema/MyRoomState.js";

import { PlayerSystem } from "./PlayerSystem.js";

import { ProjectileSystem } from "./ProjectileSystem.js";

import { EnemySystem } from "./EnemySystem.js";

export class GameSimulation {
    public readonly playerSystem: PlayerSystem;
    public readonly projectileSystem: ProjectileSystem;
    public readonly enemySystem: EnemySystem;

    public constructor( private readonly state: MyRoomState) {
        this.playerSystem = new PlayerSystem(state);
        this.enemySystem = new EnemySystem(state);
        this.projectileSystem = new ProjectileSystem(state);
    }

    public update(deltaTimeMilliseconds: number): void {
        const deltaSeconds =
            Math.min(
                Math.max(
                    deltaTimeMilliseconds / 1000,
                    0
                ),
                0.1
            );

        if (this.state.players.size > 0) {
            this.state.game.elapsedSeconds +=
                deltaSeconds;

            if (
                this.state.game.phase ===
                "waiting"
            ) {
                this.state.game.phase =
                    "playing";
            }
        }

        this.playerSystem.update(deltaTimeMilliseconds);
        this.enemySystem.update(deltaTimeMilliseconds);
        this.projectileSystem.update(deltaTimeMilliseconds);
        // this.combatSystem.update(deltaTimeMilliseconds);
    }

    public removePlayer(sessionId: string): void {
        this.playerSystem.removePlayer(sessionId);
        this.projectileSystem.removePlayer(sessionId);
    }
}