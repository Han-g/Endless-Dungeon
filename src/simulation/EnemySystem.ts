import { MyRoomState } from "../rooms/schema/MyRoomState.js";
import { EnemyState } from "../rooms/schema/EnemyState.js";
import { PlayerState } from "../rooms/schema/PlayerState.js";
import { MapCollision } from "./MapCollision.js";
import { EnemyNavigation, type NavigationPoint } from "./EnemyNavigation.js";
import { ENEMY_CONFIGS, getSpawnMaxHp, type EnemyConfig } from "./EnemyCatalog.js";
import { SPAWN_PHASES, type EnemySpawnPhase } from "./EnemySpawnPhases.js";

// 최초 반지름은 기존처럼 9~12 중 무작위 선택합니다.
const MIN_SPAWN_RADIUS = 9;
const MAX_SPAWN_RADIUS = 12;

// 원 둘레에 빈 공간이 없으면 증가시키는 반지름입니다.
const SPAWN_RADIUS_STEP = 1;

// 장애물과 적의 몸 사이에 확보할 추가 간격입니다.
const SPAWN_CLEARANCE = 0.05;

const MAX_DELTA_SECONDS = 0.1;

const NAVIGATION_CLEARANCE = SPAWN_CLEARANCE;
const NAVIGATION_CELL_SIZE = 0.5;
const MAX_PATH_EXPANDED_NODES = 8000;
const MAX_PATH_SEARCHES_PER_TICK = 2;
const PATH_REFRESH_SECONDS = 1;

const KNOCKBACK_DISTANCE = 0.6;
const KNOCKBACK_DURATION_SECONDS = 0.15;

interface EnemyKnockbackState {
    velocityX: number;
    velocityY: number;
    remainingSeconds: number;
}

interface EnemyNavigationState {
    path: NavigationPoint[];
    index: number;
    nextSearchAt: number;
}

export class EnemySystem {
    private readonly navigation: EnemyNavigation;
    private readonly navigationStates =
        new WeakMap<EnemyState, EnemyNavigationState>();
    private readonly knockbackStates =
        new WeakMap<EnemyState, EnemyKnockbackState>();

    private pathSearchesRemaining = 0;

    private nextEnemyId = 1;
    private spawnAccumulator = 0;
    private currentPhaseStartTime = -1;

    public constructor(
        private readonly state: MyRoomState,
        private readonly mapCollision: MapCollision
    ) {
        this.navigation = new EnemyNavigation(
            mapCollision, NAVIGATION_CELL_SIZE, MAX_PATH_EXPANDED_NODES);

        // 최초 추적 순간에 격자를 만들지 않도록 방 생성 시 준비합니다.
        for (const config of ENEMY_CONFIGS.values()) {
            this.navigation.prepare(config.bodyRadius + NAVIGATION_CLEARANCE);
        }
    }

    public getConfig(
        typeId: number
    ): Readonly<EnemyConfig> | undefined {
        return ENEMY_CONFIGS.get(typeId);
    }

    public applyKnockback(
        enemyId: string,
        directionX: number,
        directionY: number
    ): void {
        const enemy = this.state.enemies.get(enemyId);

        if (enemy === undefined ||
            !enemy.alive ||
            enemy.hp <= 0 ||
            KNOCKBACK_DISTANCE <= 0 ||
            KNOCKBACK_DURATION_SECONDS <= 0
        ) {
            return;
        }

        const multiplier =
            this.getConfig(enemy.typeId)
                ?.knockbackMultiplier ?? 0;

        if (!Number.isFinite(multiplier) ||
            multiplier <= 0
        ) {
            return;
        }

        const length = Math.hypot(directionX, directionY);

        if (!Number.isFinite(length) || length <= 0.0001) {
            return;
        }

        const speed = (KNOCKBACK_DISTANCE * multiplier) / KNOCKBACK_DURATION_SECONDS;

        // 힘을 계속 더하지 않고, 최근 피격 방향과 시간으로 갱신합니다.
        this.knockbackStates.set(enemy, {
            velocityX: directionX / length * speed,
            velocityY: directionY / length * speed,
            remainingSeconds: KNOCKBACK_DURATION_SECONDS
        });

        // 밀려난 뒤 이전 위치에서 계산한 경로를 따라가지 않도록 합니다.
        this.navigationStates.delete(enemy);
    }

    public update(
        deltaTimeMilliseconds: number
    ): void {
        const deltaSeconds =
            this.calculateDeltaSeconds(
                deltaTimeMilliseconds
            );

        if (deltaSeconds <= 0) {
            return;
        }

        const livingPlayers =
            this.collectLivingPlayers();

        if (livingPlayers.length === 0) {
            this.stopAllEnemies();
            return;
        }

        this.updateSpawning(
            deltaSeconds,
            livingPlayers
        );

        this.moveEnemies(
            deltaSeconds,
            livingPlayers
        );
    }

    private updateSpawning(
        deltaSeconds: number,
        livingPlayers: readonly PlayerState[]
    ): void {
        const currentPhase =
            this.findCurrentPhase(
                this.state.game.elapsedSeconds
            );

        if (currentPhase === undefined) {
            return;
        }

        if (
            this.currentPhaseStartTime !==
            currentPhase.startTime
        ) {
            this.currentPhaseStartTime =
                currentPhase.startTime;

            this.spawnAccumulator = 0;
        }

        if (
            this.state.enemies.size >=
            currentPhase.maxAlive
        ) {
            this.spawnAccumulator = 0;
            return;
        }

        this.spawnAccumulator += deltaSeconds;

        while (
            this.spawnAccumulator >=
            currentPhase.spawnInterval
        ) {
            this.spawnAccumulator -=
                currentPhase.spawnInterval;

            for (
                let index = 0;
                index < currentPhase.batchSize;
                index++
            ) {
                if (
                    this.state.enemies.size >=
                    currentPhase.maxAlive
                ) {
                    break;
                }

                const typeId =
                    this.pickEnemyType(
                        currentPhase
                    );

                if (typeId === undefined) {
                    break;
                }

                this.spawnOne(
                    typeId,
                    livingPlayers
                );
            }
        }
    }

    public spawnOne(
        typeId: number,
        livingPlayers: readonly PlayerState[] = this.collectLivingPlayers()
    ): void {
        const config =
            ENEMY_CONFIGS.get(typeId);

        if (config === undefined) {
            return;
        }

        const targetPlayer =
            this.pickSpawnTarget(
                livingPlayers
            );

        if (targetPlayer === undefined) {
            return;
        }

        const spawnPosition =
            this.createSpawnPosition(
                targetPlayer.x,
                targetPlayer.y,
                config.bodyRadius
            );

        if (spawnPosition === undefined) {
            return;
        }

        const enemy = new EnemyState();

        enemy.typeId = config.typeId;

        enemy.x = spawnPosition.x;
        enemy.y = spawnPosition.y;

        enemy.velocityX = 0;
        enemy.velocityY = 0;

        enemy.maxHp = getSpawnMaxHp(config.maxHp, this.state.game.elapsedSeconds);
        enemy.hp = enemy.maxHp;

        enemy.alive = true;

        const enemyId =
            `enemy-${this.nextEnemyId++}`;

        this.state.enemies.set(
            enemyId,
            enemy
        );
    }

    private createSpawnPosition(
        playerX: number,
        playerY: number,
        bodyRadius: number
    ): { x: number; y: number } | undefined {
        if (
            ![playerX, playerY, bodyRadius].every(Number.isFinite) ||
            bodyRadius <= 0
        ) {
            return undefined;
        }

        // 처음에만 반지름을 무작위로 정합니다.
        const initialRadius =
            MIN_SPAWN_RADIUS +
            Math.random() *
            (MAX_SPAWN_RADIUS - MIN_SPAWN_RADIUS);

        const searchLimit =
            this.mapCollision.getMaxSearchRadius(
                playerX,
                playerY
            );

        for (
            let radius = initialRadius;
            radius <= searchLimit;
            radius += SPAWN_RADIUS_STEP
        ) {
            const position =
                this.mapCollision.findSpawnOnRing(
                    playerX,
                    playerY,
                    radius,
                    bodyRadius + SPAWN_CLEARANCE
                );

            if (position !== undefined) {
                return position;
            }
        }

        // 찾지 못하면 장애물 위에 억지로 생성하지 않습니다.
        // 이번 스폰을 건너뛰고 다음 스폰 주기에 다시 시도합니다.
        return undefined;
    }

    private moveEnemies(
        deltaSeconds: number,
        livingPlayers: readonly PlayerState[]
    ): void {
        this.state.enemies.forEach(
            (enemy) => {
                if (!enemy.alive) {
                    enemy.velocityX = 0;
                    enemy.velocityY = 0;
                    return;
                }

                const config =
                    ENEMY_CONFIGS.get(
                        enemy.typeId
                    );

                if (config === undefined) {
                    enemy.velocityX = 0;
                    enemy.velocityY = 0;
                    return;
                }

                if (this.updateKnockback(enemy, config, deltaSeconds)) {
                    return;
                }

                const targetPlayer =
                    this.findNearestPlayer(
                        enemy,
                        livingPlayers
                    );

                if (targetPlayer === undefined) {
                    enemy.velocityX = 0;
                    enemy.velocityY = 0;
                    return;
                }

                this.moveEnemyTowardsPlayer(
                    enemy,
                    targetPlayer,
                    config,
                    deltaSeconds
                );
            }
        );

        this.pathSearchesRemaining = MAX_PATH_SEARCHES_PER_TICK;
    }

    private updateKnockback(
        enemy: EnemyState,
        config: Readonly<EnemyConfig>,
        deltaSeconds: number
    ): boolean {
        const knockback = this.knockbackStates.get(enemy);

        if (knockback === undefined) {
            return false;
        }

        const stepSeconds = Math.min(
            deltaSeconds,
            knockback.remainingSeconds
        );

        const startX = enemy.x;
        const startY = enemy.y;

        const moveX = knockback.velocityX * stepSeconds;
        const moveY = knockback.velocityY * stepSeconds;

        const radius =
            config.bodyRadius + NAVIGATION_CLEARANCE;

        // 이동 구간 전체가 장애물과 겹치지 않는지 검사합니다.
        const canMovePart = (fraction: number): boolean =>
            this.mapCollision.canMoveCircle(
                startX,
                startY,
                startX + moveX * fraction,
                startY + moveY * fraction,
                radius
            );

        const hitWall = !canMovePart(1);
        let moveFraction = 1;

        if (hitWall) {
            // 벽을 통과하지 않는 최대 이동 비율을 찾습니다.
            let low = 0;
            let high = 1;

            for (let i = 0; i < 10; i++) {
                const middle = (low + high) * 0.5;

                if (canMovePart(middle)) {
                    low = middle;
                } else {
                    high = middle;
                }
            }

            moveFraction = low;
        }

        const moved = this.applyEnemyMovement(
            enemy,
            startX + moveX * moveFraction,
            startY + moveY * moveFraction,
            radius,
            deltaSeconds
        );

        if (!moved) {
            enemy.velocityX = 0;
            enemy.velocityY = 0;
        }

        knockback.remainingSeconds -= stepSeconds;

        if (
            hitWall ||
            !moved ||
            knockback.remainingSeconds <= 0.000001
        ) {
            this.knockbackStates.delete(enemy);
        }

        // 마지막 넉백 틱에도 추적 이동이 덮어쓰지 않도록 합니다.
        return true;
    }

    private moveEnemyTowardsPlayer(
        enemy: EnemyState,
        targetPlayer: PlayerState,
        config: Readonly<EnemyConfig>,
        deltaSeconds: number
    ): void {
        enemy.velocityX = 0;
        enemy.velocityY = 0;

        const movement = config.movement;
        // 거리 유지형 이동은 다음 구현 단계에서 추가합니다.
        if (movement.kind !== "chase") {
            return;
        }

        const stopDistance = movement.stopDistance;

        const distance = Math.hypot(
            targetPlayer.x - enemy.x, targetPlayer.y - enemy.y);
        if (!Number.isFinite(distance) || deltaSeconds <= 0) return;

        const radius = config.bodyRadius + NAVIGATION_CLEARANCE;
        const now = this.state.game.elapsedSeconds;

        // 가까워도 벽 건너편이면 멈추지 말고 우회 경로를 찾습니다.
        if (distance <= stopDistance
            && this.mapCollision.canMoveCircle(
                enemy.x, enemy.y, targetPlayer.x, targetPlayer.y, 0.001)) {
            this.navigationStates.delete(enemy);
            return;
        }

        // 장애물 없는 구간은 즉시 직선 추적. 매번 A*를 호출하지 않습니다.
        if (distance > 0
            && this.mapCollision.canMoveCircle(
                enemy.x, enemy.y, targetPlayer.x, targetPlayer.y, radius)) {
            this.navigationStates.delete(enemy);
            const step = Math.min(
                config.moveSpeed * deltaSeconds,
                Math.max(0, distance - stopDistance));
            this.applyEnemyMovement(
                enemy,
                enemy.x + (targetPlayer.x - enemy.x) / distance * step,
                enemy.y + (targetPlayer.y - enemy.y) / distance * step,
                radius, deltaSeconds);
            return;
        }

        let runtime = this.navigationStates.get(enemy);
        if (!runtime) {
            runtime = { path: [], index: 0, nextSearchAt: 0 };
            this.navigationStates.set(enemy, runtime);
        }

        if (now >= runtime.nextSearchAt && this.pathSearchesRemaining > 0) {
            this.pathSearchesRemaining--;
            runtime.path = this.navigation.findPath(
                { x: enemy.x, y: enemy.y },
                { x: targetPlayer.x, y: targetPlayer.y },
                radius, stopDistance);
            runtime.index = 0;
            // 같은 틱에 갱신한 적들도 다음 갱신 시점이 조금씩 달라집니다.
            runtime.nextSearchAt = now + PATH_REFRESH_SECONDS + Math.random() * 0.25;
        }

        while (runtime.index < runtime.path.length
            && Math.hypot(
                runtime.path[runtime.index].x - enemy.x,
                runtime.path[runtime.index].y - enemy.y) < 0.02) {
            runtime.index++;
        }
        const waypoint = runtime.path[runtime.index];
        if (!waypoint) return;

        const dx = waypoint.x - enemy.x;
        const dy = waypoint.y - enemy.y;
        const waypointDistance = Math.hypot(dx, dy);
        const step = Math.min(config.moveSpeed * deltaSeconds, waypointDistance);
        if (!this.applyEnemyMovement(
            enemy,
            enemy.x + dx / waypointDistance * step,
            enemy.y + dy / waypointDistance * step,
            radius, deltaSeconds)) {
            // 경로가 유효하지 않으면 정지한 상태에서 다시 탐색합니다.
            runtime.path = [];
            runtime.index = 0;
            runtime.nextSearchAt = now + 0.2;
        }
    }

    private applyEnemyMovement(
        enemy: EnemyState,
        nextX: number, nextY: number,
        radius: number, deltaSeconds: number
    ): boolean {
        if (!this.mapCollision.canMoveCircle(
            enemy.x, enemy.y, nextX, nextY, radius)) return false;
        // 애니메이션에는 실제로 이동한 속도를 보냅니다.
        enemy.velocityX = (nextX - enemy.x) / deltaSeconds;
        enemy.velocityY = (nextY - enemy.y) / deltaSeconds;
        enemy.x = nextX;
        enemy.y = nextY;
        return true;
    }

    private findNearestPlayer(
        enemy: EnemyState,
        livingPlayers: readonly PlayerState[]
    ): PlayerState | undefined {
        let nearestPlayer:
            PlayerState | undefined;

        let nearestDistanceSquared =
            Number.POSITIVE_INFINITY;

        for (
            let index = 0;
            index < livingPlayers.length;
            index++
        ) {
            const player =
                livingPlayers[index];

            const offsetX =
                player.x - enemy.x;

            const offsetY =
                player.y - enemy.y;

            const distanceSquared =
                offsetX * offsetX +
                offsetY * offsetY;

            if (
                distanceSquared <
                nearestDistanceSquared
            ) {
                nearestDistanceSquared =
                    distanceSquared;

                nearestPlayer = player;
            }
        }

        return nearestPlayer;
    }

    private collectLivingPlayers():
        PlayerState[] {
        const livingPlayers:
            PlayerState[] = [];

        this.state.players.forEach(
            (player) => {
                if (player.alive) {
                    livingPlayers.push(
                        player
                    );
                }
            }
        );

        return livingPlayers;
    }

    private pickSpawnTarget(
        livingPlayers: readonly PlayerState[]
    ): PlayerState | undefined {
        if (livingPlayers.length === 0) {
            return undefined;
        }

        const randomIndex =
            Math.floor(
                Math.random() *
                livingPlayers.length
            );

        return livingPlayers[randomIndex];
    }

    private pickEnemyType(
        phase: EnemySpawnPhase
    ): number | undefined {
        let totalWeight = 0;

        for (
            let index = 0;
            index < phase.enemies.length;
            index++
        ) {
            const entry =
                phase.enemies[index];

            if (
                entry.weight > 0 &&
                ENEMY_CONFIGS.has(
                    entry.typeId
                )
            ) {
                totalWeight += entry.weight;
            }
        }

        if (totalWeight <= 0) {
            return undefined;
        }

        let randomValue =
            Math.random() *
            totalWeight;

        for (
            let index = 0;
            index < phase.enemies.length;
            index++
        ) {
            const entry =
                phase.enemies[index];

            if (
                entry.weight <= 0 ||
                !ENEMY_CONFIGS.has(
                    entry.typeId
                )
            ) {
                continue;
            }

            randomValue -= entry.weight;

            if (randomValue < 0) {
                return entry.typeId;
            }
        }

        return undefined;
    }

    private findCurrentPhase(
        elapsedSeconds: number
    ): EnemySpawnPhase | undefined {
        let currentPhase:
            EnemySpawnPhase | undefined;

        for (
            let index = 0;
            index < SPAWN_PHASES.length;
            index++
        ) {
            const phase =
                SPAWN_PHASES[index];

            if (
                phase.startTime <=
                elapsedSeconds
            ) {
                currentPhase = phase;
            }
        }

        return currentPhase;
    }

    private stopAllEnemies(): void {
        this.state.enemies.forEach(
            (enemy) => {
                enemy.velocityX = 0;
                enemy.velocityY = 0;
            }
        );
    }

    private calculateDeltaSeconds(
        deltaTimeMilliseconds: number
    ): number {
        return Math.min(
            Math.max(
                deltaTimeMilliseconds /
                1000,

                0
            ),
            MAX_DELTA_SECONDS
        );
    }
}