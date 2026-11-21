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

export const ENEMY_CONFIGS:
    ReadonlyMap<number, Readonly<EnemyConfig>> =
    new Map<number, Readonly<EnemyConfig>>([
        [
            1,
            {
                typeId: 1,

                maxHp: 30,
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
                maxHp: 15,
                moveSpeed: 4,
                bodyRadius: 0.3,
                knockbackMultiplier: 1,
                movement: { kind: "chase", stopDistance: 0.4 },
                contact: { damage: 4, range: 0.4, intervalSeconds: 0.75 },
                attack: null
            }
        ]
    ]);