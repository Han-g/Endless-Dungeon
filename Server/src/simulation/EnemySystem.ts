import { MyRoomState } from "../rooms/schema/MyRoomState.js";

import { EnemyState } from "../rooms/schema/EnemyState.js";

import { PlayerState } from "../rooms/schema/PlayerState.js";

export interface EnemyConfig {
    typeId: number;
    moveSpeed: number;
    maxHp: number;
    contactDamage: number;
    bodyRadius: number;
    attackRadius: number;
    contactCooldownSeconds: number;
}

interface EnemySpawnEntry {
    typeId: number;
    weight: number;
}

interface EnemySpawnPhase {
    startTime: number;
    spawnInterval: number;
    batchSize: number;
    maxAlive: number;
    enemies: readonly EnemySpawnEntry[];
}

const ENEMY_CONFIGS:
    ReadonlyMap<number, Readonly<EnemyConfig>> =
    new Map<number, Readonly<EnemyConfig>>([
        [
            1,
            {
                typeId: 1,
                moveSpeed: 2,
                maxHp: 10,
                contactDamage: 10,
                bodyRadius: 0.3,
                attackRadius: 1.2,
                contactCooldownSeconds: 0.75
            }
        ]
    ]);

const SPAWN_PHASES:
    readonly EnemySpawnPhase[] = [
        {
            startTime: 0,
            spawnInterval: 1,
            batchSize: 1,
            maxAlive: 20,

            enemies: [
                {
                    typeId: 1,
                    weight: 100
                }
            ]
        },

        {
            startTime: 60,
            spawnInterval: 0.7,
            batchSize: 2,
            maxAlive: 40,

            enemies: [
                {
                    typeId: 1,
                    weight: 100
                }
            ]
        }
    ];

const MIN_SPAWN_RADIUS = 9;

const MAX_SPAWN_RADIUS = 12;

const MAX_DELTA_SECONDS = 0.1;

export class EnemySystem {
    private nextEnemyId = 1;
    private spawnAccumulator = 0;
    private currentPhaseStartTime = -1;

    public constructor(
        private readonly state: MyRoomState
    ) {

    }

    public getConfig(
        typeId: number
    ): Readonly<EnemyConfig> | undefined {
        return ENEMY_CONFIGS.get(typeId);
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

    private spawnOne(
        typeId: number,
        livingPlayers: readonly PlayerState[]
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
                targetPlayer.y
            );

        const enemy = new EnemyState();

        enemy.typeId = config.typeId;

        enemy.x = spawnPosition.x;
        enemy.y = spawnPosition.y;

        enemy.velocityX = 0;
        enemy.velocityY = 0;

        enemy.hp = config.maxHp;
        enemy.maxHp = config.maxHp;

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
        playerY: number
    ): { x: number; y: number } {
        const angle =
            Math.random() *
            Math.PI *
            2;

        const radiusDifference =
            MAX_SPAWN_RADIUS -
            MIN_SPAWN_RADIUS;

        const distance =
            MIN_SPAWN_RADIUS +
            Math.random() *
            radiusDifference;

        return {
            x: playerX +
                Math.cos(angle) *
                distance,

            y: playerY +
                Math.sin(angle) *
                distance
        };
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
    }

    private moveEnemyTowardsPlayer(
        enemy: EnemyState,
        targetPlayer: PlayerState,
        config: Readonly<EnemyConfig>,
        deltaSeconds: number
    ): void {
        const offsetX = targetPlayer.x - enemy.x;
        const offsetY = targetPlayer.y - enemy.y;
        const distance =Math.hypot(offsetX, offsetY);

        if (
            !Number.isFinite(distance) ||
            distance <= config.attackRadius ||
            distance < 0.0001
        ) {
            enemy.velocityX = 0;
            enemy.velocityY = 0;
            return;
        }

        const directionX = offsetX / distance;
        const directionY = offsetY / distance;

        enemy.velocityX =
            directionX *
            config.moveSpeed;

        enemy.velocityY =
            directionY *
            config.moveSpeed;

        const remainingDistance =
            Math.max(
                0,
                distance -
                config.attackRadius
            );

        const movementDistance =
            Math.min(
                config.moveSpeed *
                deltaSeconds,

                remainingDistance
            );

        enemy.x +=
            directionX *
            movementDistance;

        enemy.y +=
            directionY *
            movementDistance;
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