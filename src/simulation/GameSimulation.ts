import { MyRoomState } from "../rooms/schema/MyRoomState.js";

import { PlayerSystem } from "./PlayerSystem.js";

import { ProjectileSystem } from "./ProjectileSystem.js";

import { EnemySystem } from "./EnemySystem.js";

import { CombatSystem } from "./CombatSystem.js";

import { MapCollision } from "./MapCollision.js";

import { TeamTraits } from "../game/TeamTraits.js";

export class GameSimulation {
    public readonly teamTraits: TeamTraits;
    public readonly playerSystem: PlayerSystem;
    public readonly projectileSystem: ProjectileSystem;
    public readonly enemySystem: EnemySystem;
    public readonly combatSystem: CombatSystem;
    public readonly mapCollision: MapCollision;

    public constructor(private readonly state: MyRoomState) {
        this.teamTraits = new TeamTraits(state);
        this.mapCollision = new MapCollision();

        this.playerSystem = new PlayerSystem(
            state,
            this.mapCollision
        );

        this.enemySystem = new EnemySystem(
            state,
            this.mapCollision
        );

        this.projectileSystem = new ProjectileSystem(state);

        this.combatSystem = new CombatSystem(
            state,
            this.enemySystem,
            this.projectileSystem
        );
    }

    public update(deltaTimeMilliseconds: number): void {
        if (
            this.state.game.phase === "finished" ||
            this.state.players.size === 0
        ) {
            return;
        }

        // 마지막 생존자가 퇴장한 경우도 처리합니다.
        if (this.finishIfAllPlayersDead()) {
            this.teamTraits.update();
            return;
        }

        const deltaSeconds = Math.min(
            Math.max(deltaTimeMilliseconds / 1000, 0),
            0.1
        );

        if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
            return;
        }

        if (this.state.game.phase === "waiting") {
            this.state.game.phase = "playing";
        }

        this.state.game.elapsedSeconds += deltaSeconds;

        this.playerSystem.update(deltaTimeMilliseconds);
        this.enemySystem.update(deltaTimeMilliseconds);
        this.projectileSystem.update(deltaTimeMilliseconds);
        this.combatSystem.update(deltaTimeMilliseconds);

        // 이번 틱의 피해 처리가 끝난 뒤 전원 사망을 검사합니다.
        this.finishIfAllPlayersDead();
        this.teamTraits.update();
    }

    private finishIfAllPlayersDead(): boolean {
        // 빈 방을 전원 사망으로 판단하지 않습니다.
        if (this.state.players.size === 0) {
            return false;
        }

        for (const player of this.state.players.values()) {
            if (player.alive) {
                return false;
            }
        }

        this.state.players.forEach((player) => {
            player.velocityX = 0;
            player.velocityY = 0;
        });

        this.state.enemies.forEach((enemy) => {
            enemy.velocityX = 0;
            enemy.velocityY = 0;
        });

        this.state.game.phase = "finished";

        return true;
    }

    public removePlayer(sessionId: string): void {
        this.playerSystem.removePlayer(sessionId);
        this.projectileSystem.removePlayer(sessionId);
        this.combatSystem.removePlayer(sessionId);
    }
}