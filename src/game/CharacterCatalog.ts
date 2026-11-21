export interface ProjectileConfig {
    readonly projectileTypeId: number;
    readonly attacksPerSecond: number;
    readonly speed: number;
    readonly range: number;
    readonly damage: number;
    readonly spawnDistance: number;
    readonly originOffsetY: number;
    readonly hitRadius: number;
    readonly maxHitCount: number;
}

export interface CharacterDefinition {
    readonly id: number;
    readonly maxHp: number;
    readonly moveSpeed: number;
    readonly weapon: ProjectileConfig;
}

export interface CharacterBaseStatsTarget {
    characterId: number;
    hp: number;
    maxHp: number;
    moveSpeed: number;
    damage: number;
    attacksPerSecond: number;
    projectileSpeed: number;
    projectileRange: number;
}

// 기본 체력/이동속도와 실제 공격 수치를 함께 관리합니다.
export const CHARACTER_DEFINITIONS: readonly CharacterDefinition[] = [
    {
        id: 1, maxHp: 150, moveSpeed: 3.5,
        weapon: {
            projectileTypeId: 1, attacksPerSecond: 0.7,
            speed: 12, range: 8, damage: 15,
            spawnDistance: 0.3, originOffsetY: 0.5,
            hitRadius: 0.25, maxHitCount: 2
        }
    },
    {
        id: 2, maxHp: 100, moveSpeed: 5,
        weapon: {
            projectileTypeId: 2, attacksPerSecond: 1.0,
            speed: 14, range: 10, damage: 10,
            spawnDistance: 0.3, originOffsetY: 0.5,
            hitRadius: 0.25, maxHitCount: 1
        }
    },
    {
        id: 3, maxHp: 120, moveSpeed: 6,
        weapon: {
            projectileTypeId: 3, attacksPerSecond: 0.8,
            speed: 13, range: 7, damage: 12,
            spawnDistance: 0.3, originOffsetY: 0.5,
            hitRadius: 0.25, maxHitCount: 2
        }
    },
    {
        id: 4, maxHp: 100, moveSpeed: 3.6,
        weapon: {
            projectileTypeId: 4, attacksPerSecond: 0.5,
            speed: 10, range: 9, damage: 20,
            spawnDistance: 0.3, originOffsetY: 0.5,
            hitRadius: 0.25, maxHitCount: 3
        }
    }
];

const definitionsById = new Map<number, CharacterDefinition>(
    CHARACTER_DEFINITIONS.map(definition => [definition.id, definition])
);

export function isCharacterId(value: unknown): value is number {
    return typeof value === "number" &&
        Number.isInteger(value) && definitionsById.has(value);
}

export function getCharacterDefinition(characterId: number): CharacterDefinition {
    const definition = definitionsById.get(characterId);
    if (definition === undefined) {
        throw new Error(`Unknown characterId: ${characterId}`);
    }
    return definition;
}

// 방 입장/대기 중 선택 시에만 호출합니다. 전투 중 체력을 초기화하지 않습니다.
export function applyCharacterBaseStats(
    player: CharacterBaseStatsTarget,
    characterId: number
): void {
    const definition = getCharacterDefinition(characterId);
    player.characterId = definition.id;
    player.maxHp = definition.maxHp;
    player.hp = definition.maxHp;
    player.moveSpeed = definition.moveSpeed;
    player.damage = definition.weapon.damage;
    player.attacksPerSecond = definition.weapon.attacksPerSecond;
    player.projectileSpeed = definition.weapon.speed;
    player.projectileRange = definition.weapon.range;
}
