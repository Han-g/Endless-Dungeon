export interface EnemySpawnEntry {
    readonly typeId: number;
    readonly weight: number;
}

export interface EnemySpawnPhase {
    readonly startTime: number;
    readonly spawnInterval: number;
    readonly batchSize: number;
    readonly maxAlive: number;

    readonly enemies: readonly EnemySpawnEntry[];
}

export const SPAWN_PHASES:
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
                { typeId: 1, weight: 70 }, // Slime
                { typeId: 2, weight: 30 }  // Fast bat
            ]
        },
        {
            startTime: 120,
            spawnInterval: 0.7,
            batchSize: 2,
            maxAlive: 40,
            enemies: [
                { typeId: 1, weight: 55 },
                { typeId: 2, weight: 30 },
                { typeId: 3, weight: 15 } // Elder treant
            ]
        },
        {
            startTime: 180,
            spawnInterval: 0.7,
            batchSize: 2,
            maxAlive: 40,
            enemies: [
                { typeId: 1, weight: 48 },
                { typeId: 2, weight: 25 },
                { typeId: 3, weight: 15 },
                { typeId: 4, weight: 12 } // Violet caster
            ]
        }
    ];
