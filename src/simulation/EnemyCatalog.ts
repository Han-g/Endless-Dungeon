export type EnemyMovementConfig =
    | {
        kind: "chase";
        stopDistance: number;
    }
    | {
        kind: "keepDistance";
        minDistance: number;
        preferredDistance: number;
        maxDistance: number;
    };

export interface EnemyContactConfig {
    damage: number;
    range: number;
    intervalSeconds: number;
}

interface AttackTiming {
    damage: number;

    // 공격 예고를 시작할 수 있는 최대 거리
    attackRange: number;

    windupSeconds: number;
    recoverySeconds: number;

    // 공격 시작 → 다음 공격 시작의 최소 간격
    cooldownSeconds: number;
}

export type EnemyAttackConfig = AttackTiming & (
    | {
        kind: "melee";
        hitRange: number;
        halfAngleDegrees: number;
    }
    | {
        kind: "projectile";
        projectileTypeId: number;
        speed: number;
        range: number;
        hitRadius: number;

        shotCount: number;
        spreadDegrees: number;

        originOffsetX: number;
        originOffsetY: number;
        spawnDistance: number;
    }
    | {
        kind: "charge";
        speed: number;
        durationSeconds: number;
        hitRadius: number;
    }
);

export interface EnemyConfig {
    typeId: number;

    maxHp: number;
    moveSpeed: number;
    bodyRadius: number;

    // 1: 기본 넉백, 0.3: 약하게, 0: 면역
    knockbackMultiplier: number;

    movement: EnemyMovementConfig;

    // null이면 접촉 피해 없음
    contact: EnemyContactConfig | null;

// null이면 별도 능동 공격 없음
    attack: EnemyAttackConfig | null;
}

// Only newly spawned enemies use the current multiplier.
export function getSpawnMaxHp(baseHp: number, elapsedSeconds: number): number {
    const growthMinutes = Math.max(0, (elapsedSeconds - 120) / 60);
    const multiplier = Math.min(2.5, 1 + 0.1 * growthMinutes);
    return Math.round(baseHp * multiplier);
}

export const ENEMY_CONFIGS:
    ReadonlyMap<number, Readonly<EnemyConfig>> =
    new Map<number, Readonly<EnemyConfig>>([
        [
            1,
            {
                typeId: 1,

                maxHp: 15, // Slime
                moveSpeed: 2,
                bodyRadius: 0.3,

                knockbackMultiplier: 1,

                movement: {
                    kind: "chase",
                    stopDistance: 0.4
                },

                contact: {
                    damage: 10,
                    range: 0.4,
                    intervalSeconds: 0.75
                },

                attack: null
            }
        ],
        [
            2,
            {
                typeId: 2, // Fast bat
                maxHp: 9,
                moveSpeed: 3.65,
                bodyRadius: 0.3,
                knockbackMultiplier: 1,
                movement: { kind: "chase", stopDistance: 0.4 },
                contact: { damage: 4, range: 0.44, intervalSeconds: 0.75 },
                attack: null
            }
        ],
        [
            3,
            {
                typeId: 3, // Elder treant
                maxHp: 36,
                moveSpeed: 1.45,
                bodyRadius: 0.35,
                knockbackMultiplier: 0.25,
                movement: { kind: "chase", stopDistance: 0.45 },
                contact: { damage: 12, range: 0.55, intervalSeconds: 1.25 },
                attack: null
            }
        ],
        [
            4,
            {
                typeId: 4, // Violet caster
                maxHp: 18,
                moveSpeed: 2.2,
                bodyRadius: 0.3,
                knockbackMultiplier: 1,
                movement: { kind: "keepDistance", minDistance: 4, preferredDistance: 5, maxDistance: 6 },
                contact: null,
                attack: {
                    kind: "projectile", projectileTypeId: 5,
                    damage: 7, speed: 3.9, range: 24, hitRadius: 0.15,
                    attackRange: 6.5, windupSeconds: 0.3, recoverySeconds: 0.2, cooldownSeconds: 2,
                    shotCount: 1, spreadDegrees: 0,
                    originOffsetX: 0, originOffsetY: 0.25, spawnDistance: 0
                }
            }
        ]
    ]);
