import { MyRoomState } from "../rooms/schema/MyRoomState.js";

import { ProjectileState } from "../rooms/schema/ProjectileState.js";

interface AttackInputMessage {
    aimX: number;
    aimY: number;
}

interface StoredAimInput {
    x: number;
    y: number;
}

interface RuntimeProjectile {
    speed: number;
    damage: number;
    remainingDistance: number;

    previousX: number;
    previousY: number;

    hitRadius: number;
    remainingHitCount: number;

    hitEnemyIds: Set<string>;
}

interface ProjectileConfig {
    projectileTypeId: number;
    attacksPerSecond: number;
    speed: number;
    range: number;
    damage: number;
    spawnDistance: number;
    originOffsetY: number;
    hitRadius: number;

    maxHitCount: number;
}

const PROJECTILE_CONFIGS:
    ReadonlyMap<number, ProjectileConfig> =
    new Map<number, ProjectileConfig>([
        [
            1,
            {
                projectileTypeId: 1,
                attacksPerSecond: 0.7,
                speed: 12,
                range: 8,
                damage: 15,
                spawnDistance: 0.3,
                originOffsetY: 0.5,
                hitRadius: 0.25,
                maxHitCount: 2
            }
        ],
        [
            2,
            {
                projectileTypeId: 2,
                attacksPerSecond: 1.0,
                speed: 14,
                range: 10,
                damage: 10,
                spawnDistance: 0.3,
                originOffsetY: 0.5,
                hitRadius: 0.25,
                maxHitCount: 1
            }
        ],
        [
            3,
            {
                projectileTypeId: 3,
                attacksPerSecond: 0.8,
                speed: 13,
                range: 7,
                damage: 12,
                spawnDistance: 0.3,
                originOffsetY: 0.5,
                hitRadius: 0.25,
                maxHitCount: 2
            }
        ],
        [
            4,
            {
                projectileTypeId: 4,
                attacksPerSecond: 0.5,
                speed: 10,
                range: 9,
                damage: 20,
                spawnDistance: 0.3,
                originOffsetY: 0.5,
                hitRadius: 0.25,
                maxHitCount: 3
            }
        ]
    ]);

const MAX_PROJECTILES = 512;
const MAX_DELTA_SECONDS = 0.1;

function getLevelPierceBonus(
    level: number
): number {
    if (level >= 8) {
        return 3;
    }

    if (level >= 5) {
        return 2;
    }

    if (level >= 3) {
        return 1;
    }

    return 0;
}

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
        private readonly state: MyRoomState
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

                // 이 플레이어가 선택한 캐릭터의
                // 투사체 설정을 가져온다.
                const config =
                    PROJECTILE_CONFIGS.get(
                        player.characterId) ??
                    PROJECTILE_CONFIGS.get(1)!;

                const levelPierceBonus =
                    getLevelPierceBonus(
                        player.level);

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

                this.createProjectile(
                    sessionId,
                    player.x,
                    player.y,
                    aim,
                    config,
                    levelPierceBonus
                );

                this.nextFireTimes.set(
                    sessionId,
                    this.elapsedSeconds +
                    1 / config.attacksPerSecond
                );
            }
        );
    }

    private createProjectile(
        ownerSessionId: string,
        playerX: number,
        playerY: number,
        aim: StoredAimInput,
        config: ProjectileConfig,
        levelPierceBonus: number
    ): void {
        const projectileId =
            `projectile-${this.nextProjectileId++}`;

        const projectile = new ProjectileState();

        // 발사한 플레이어
        projectile.ownerSessionId =
            ownerSessionId;

        // 캐릭터에 대응하는 투사체 종류
        projectile.projectileTypeId =
            config.projectileTypeId;

        // 투사체 이동 방향
        projectile.directionX =
            aim.x;

        projectile.directionY =
            aim.y;

        // 플레이어 중심에서 조금 떨어진 위치에 생성
        const originX = playerX;
        const originY =
            playerY + config.originOffsetY;

        projectile.x =
            originX +
            aim.x * config.spawnDistance;

        projectile.y =
            originY +
            aim.y * config.spawnDistance;

        // Colyseus State에 등록
        // 이 부분이 있어야 Unity에 투사체가 전달된다.
        this.state.projectiles.set(
            projectileId,
            projectile
        );

        // 서버 내부에서만 사용하는 이동·전투 수치
        this.runtimeProjectiles.set(
            projectileId,
            {
                speed: config.speed,
                damage: config.damage,
                remainingDistance: config.range,

                previousX: projectile.x,
                previousY: projectile.y,

                hitRadius: config.hitRadius,
                remainingHitCount: Math.max(1, config.maxHitCount + levelPierceBonus),

                hitEnemyIds: new Set<string>()
            }
        );
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

                projectile.x += projectile.directionX * moveDistance;
                projectile.y += projectile.directionY * moveDistance;

                runtime.remainingDistance -= moveDistance;
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

        return runtime !== undefined &&
            !runtime.hitEnemyIds.has(enemyId);
    }

    public recordEnemyHit(
        projectileId: string,
        enemyId: string
    ): boolean {
        const runtime =
            this.runtimeProjectiles.get(
                projectileId);

        if (runtime === undefined) {
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