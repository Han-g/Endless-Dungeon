import { extraTraitHits } from "../game/TeamTraits.js";
import { MyRoomState } from "../rooms/schema/MyRoomState.js";

import { ProjectileState } from "../rooms/schema/ProjectileState.js";
import { getCharacterDefinition, type ProjectileConfig } from "../game/CharacterCatalog.js";

import type { PlayerState } from "../rooms/schema/PlayerState.js";
import type { EnemyAttackConfig } from "./EnemyCatalog.js";
import { MapCollision } from "./MapCollision.js";

interface AttackInputMessage {
    aimX: number;
    aimY: number;
}

interface StoredAimInput {
    x: number;
    y: number;
}

interface RuntimeProjectile {
    faction: "player" | "enemy";
    speed: number;
    damage: number;
    remainingDistance: number;

    previousX: number;
    previousY: number;

    hitRadius: number;
    remainingHitCount: number;

    hitEnemyIds: Set<string>;
}

const MAX_PROJECTILES = 512;
const MAX_DELTA_SECONDS = 0.1;

export class ProjectileSystem {
    private readonly aimInputs =
        new Map<string, StoredAimInput>();

    private readonly nextFireTimes =
        new Map<string, number>();

    private readonly runtimeProjectiles =
        new Map<string, RuntimeProjectile>();

    private elapsedSeconds = 0;
    private nextProjectileId = 1;

    public constructor(
        private readonly state: MyRoomState,
        private mapCollision?: MapCollision
    ) {
    }

    public setAttackInput(
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
            message as Partial<AttackInputMessage>;

        let x = Number(input.aimX);
        let y = Number(input.aimY);

        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y)
        ) {
            return;
        }

        const magnitude =
            Math.hypot(x, y);

        if (
            !Number.isFinite(magnitude) ||
            magnitude < 0.0001
        ) {
            return;
        }

        x /= magnitude;
        y /= magnitude;

        this.aimInputs.set(
            sessionId,
            { x, y }
        );
    }


    public update(
        deltaTimeMilliseconds: number
    ): void {
        const deltaSeconds = Math.min(
            Math.max(
                deltaTimeMilliseconds / 1000,
                0
            ),
            MAX_DELTA_SECONDS
        );

        this.elapsedSeconds += deltaSeconds;

        this.moveProjectiles(deltaSeconds);
        this.spawnProjectiles();
    }



    private spawnProjectiles(): void {
        this.state.players.forEach(
            (player, sessionId) => {
                if (
                    !player.alive ||
                    this.state.projectiles.size >=
                    MAX_PROJECTILES
                ) {
                    return;
                }

                const aim =
                    this.aimInputs.get(sessionId);

                if (aim === undefined) {
                    return;
                }

                const nextFireTime =
                    this.nextFireTimes.get(
                        sessionId) ?? 0;

                if (
                    this.elapsedSeconds <
                    nextFireTime
                ) {
                    return;
                }

                const weapon = getCharacterDefinition(player.characterId).weapon;
                this.firePlayerProjectile(sessionId, player, aim, weapon);

                this.nextFireTimes.set(
                    sessionId,
                    this.elapsedSeconds +
                    1 / player.attacksPerSecond
                );
            }
        );
    }

    private firePlayerProjectile(
        ownerSessionId: string,
        player: PlayerState,
        aim: StoredAimInput,
        config: ProjectileConfig
    ): void {
        this.addProjectile(
            ownerSessionId, config.projectileTypeId,
            player.x + aim.x * config.spawnDistance,
            player.y + config.originOffsetY + aim.y * config.spawnDistance,
            aim.x, aim.y,
            {
                faction: "player",
                speed: player.projectileSpeed,
                damage: player.damage,
                remainingDistance: player.projectileRange,
                hitRadius: config.hitRadius,
                remainingHitCount: Math.max(1,
                    config.maxHitCount + player.bonusProjectileHits + extraTraitHits(player))
            }
        );
    }

    public fireEnemyBolt(
        enemyId: string, x: number, y: number, dirX: number, dirY: number,
        attack: Extract<EnemyAttackConfig, { kind: "projectile" }>
    ): void {
        if (this.state.projectiles.size >= MAX_PROJECTILES) return;
        this.mapCollision ??= new MapCollision();
        if (!this.mapCollision.canMoveCircle(x, y, x, y, attack.hitRadius)) return;

        this.addProjectile(
            enemyId, attack.projectileTypeId, x, y, dirX, dirY,
            {
                faction: "enemy",
                speed: attack.speed,
                damage: attack.damage,
                remainingDistance: attack.range,
                hitRadius: attack.hitRadius,
                remainingHitCount: 1
            }
        );
    }

    private addProjectile(
        ownerId: string, typeId: number,
        x: number, y: number, dirX: number, dirY: number,
        stats: Omit<RuntimeProjectile, "previousX" | "previousY" | "hitEnemyIds">
    ): void {
        const id = `projectile-${this.nextProjectileId++}`;
        const projectile = new ProjectileState();
        projectile.ownerSessionId = ownerId;
        projectile.projectileTypeId = typeId;
        projectile.x = x;
        projectile.y = y;
        projectile.directionX = dirX;
        projectile.directionY = dirY;

        this.runtimeProjectiles.set(id, {
            ...stats, previousX: x, previousY: y, hitEnemyIds: new Set<string>()
        });
        this.state.projectiles.set(id, projectile);
    }

    private moveProjectiles(
        deltaSeconds: number
    ): void {
        const invalidIds: string[] = [];

        this.state.projectiles.forEach(
            (projectile, projectileId) => {
                const runtime =
                    this.runtimeProjectiles.get(
                        projectileId);

                if (runtime === undefined) {
                    invalidIds.push(projectileId);
                    return;
                }

                runtime.previousX = projectile.x;
                runtime.previousY = projectile.y;

                const moveDistance =
                    Math.max(
                        0,
                        Math.min(
                            runtime.speed *
                            deltaSeconds,

                            runtime.remainingDistance
                        )
                    );

                const endX = projectile.x + projectile.directionX * moveDistance;
                const endY = projectile.y + projectile.directionY * moveDistance;
                if (runtime.faction === "enemy" && this.mapCollision &&
                    !this.mapCollision.canMoveCircle(projectile.x, projectile.y, endX, endY, runtime.hitRadius)) {
                    // 벽 앞까지의 구간은 이번 틱에 플레이어와 충돌할 수 있다.
                    let clear = 0;
                    let blocked = 1;
                    for (let i = 0; i < 12; i++) {
                        const t = (clear + blocked) / 2;
                        const x = projectile.x + (endX - projectile.x) * t;
                        const y = projectile.y + (endY - projectile.y) * t;
                        if (this.mapCollision.canMoveCircle(projectile.x, projectile.y, x, y, runtime.hitRadius)) {
                            clear = t;
                        } else {
                            blocked = t;
                        }
                    }
                    projectile.x += (endX - projectile.x) * clear;
                    projectile.y += (endY - projectile.y) * clear;
                    runtime.remainingDistance = 0;
                } else {
                    projectile.x = endX;
                    projectile.y = endY;
                    runtime.remainingDistance -= moveDistance;
                }
            }
        );

        for (const projectileId of invalidIds) {
            this.state.projectiles.delete(
                projectileId);
        }
    }

    public getRuntimeProjectile(
        projectileId: string
    ): Readonly<RuntimeProjectile> | undefined {
        return this.runtimeProjectiles.get(
            projectileId);
    }

    public canHitEnemy(
        projectileId: string,
        enemyId: string
    ): boolean {
        const runtime =
            this.runtimeProjectiles.get(
                projectileId);

        return runtime?.faction === "player" &&
            !runtime.hitEnemyIds.has(enemyId);
    }

    public recordEnemyHit(
        projectileId: string,
        enemyId: string
    ): boolean {
        const runtime =
            this.runtimeProjectiles.get(
                projectileId);

        if (runtime?.faction !== "player") {
            return true;
        }

        if (runtime.hitEnemyIds.has(enemyId)) {
            return false;
        }

        runtime.hitEnemyIds.add(enemyId);
        runtime.remainingHitCount -= 1;

        // true면 타격 한도를 모두 사용한 상태
        return runtime.remainingHitCount <= 0;
    }

    public removeProjectile(
        projectileId: string
    ): void {
        this.state.projectiles.delete(
            projectileId);

        this.runtimeProjectiles.delete(
            projectileId);
    }

    public removeExpiredProjectiles(): void {
        const removeIds: string[] = [];

        this.runtimeProjectiles.forEach(
            (runtime, projectileId) => {
                if (
                    runtime.remainingDistance <= 0 ||
                    !this.state.projectiles.has(
                        projectileId)
                ) {
                    removeIds.push(
                        projectileId);
                }
            }
        );

        for (const projectileId of removeIds) {
            this.removeProjectile(
                projectileId);
        }
    }

    public removePlayer(
        sessionId: string
    ): void {
        this.aimInputs.delete(sessionId);
        this.nextFireTimes.delete(sessionId);
    }
}
