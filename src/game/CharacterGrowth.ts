import { CHARACTER_DEFINITIONS } from "./CharacterCatalog.js";
import type { PlayerState } from "../rooms/schema/PlayerState.js";

// 밸런스 설정. 기본 능력치는 CharacterCatalog.ts, 레벨당 증가량은 이 파일에서 조정합니다.
export const XP_PER_KILL = 10;
// 인덱스 0이 레벨 1입니다. 각 값은 해당 레벨에 도달하는 데 필요한 누적 XP입니다.
export const LEVEL_XP: readonly number[] = [
    0, 100, 500, 2000, 5000, 10000, 30000, 50000, 80000, 120000
];
// 각 레벨에 도달할 때 투사체가 적 한 마리를 추가로 맞힐 수 있습니다.
const EXTRA_HIT_LEVELS: readonly number[] = [3, 5, 8];

interface StatGain {
    maxHp: number;
    damage: number;
    attacksPerSecond: number;
    moveSpeed: number;
    projectileSpeed: number;
    range: number;
}

// 모두 레벨 1회당 더하는 절대량입니다. 체력·피해는 정수, 속도·사거리는 소수를 허용합니다.
export const GAINS_PER_LEVEL: Readonly<Record<number, Readonly<StatGain>>> = {
    // 전사
    1: { maxHp: 20, damage: 2, attacksPerSecond: 0.02, moveSpeed: 0.04, projectileSpeed: 0, range: 0 },
    // 궁수
    2: { maxHp: 5, damage: 1, attacksPerSecond: 0.15, moveSpeed: 0.10, projectileSpeed: 0, range: 0.5 },
    // 도적
    3: { maxHp: 5, damage: 1, attacksPerSecond: 0.08, moveSpeed: 0.25, projectileSpeed: 0, range: 0 },
    // 마법사
    4: { maxHp: 5, damage: 4, attacksPerSecond: 0.02, moveSpeed: 0.04, projectileSpeed: 0.5, range: 0 }
};

const MAX_UINT32 = 0xffffffff;
if (!Number.isSafeInteger(XP_PER_KILL) || XP_PER_KILL < 0 ||
    LEVEL_XP.length > 255 || LEVEL_XP[0] !== 0 ||
    LEVEL_XP.some((xp, i) => !Number.isInteger(xp) || xp > MAX_UINT32 ||
        (i > 0 && xp <= LEVEL_XP[i - 1]))) {
    throw new Error("Invalid XP_PER_KILL or cumulative LEVEL_XP thresholds");
}
for (const definition of CHARACTER_DEFINITIONS) {
    const gains = GAINS_PER_LEVEL[definition.id];
    if (!gains || Object.values(gains).some(n => !Number.isFinite(n) || n < 0) ||
        !Number.isInteger(gains.maxHp) || !Number.isInteger(gains.damage)) {
        throw new Error("Invalid growth for character " + definition.id);
    }
}

export function nextLevelExperience(level: number): number {
    return LEVEL_XP[level] ?? 0; // 최고 레벨에는 다음 목표가 없습니다.
}

export function getLevelPierceBonus(level: number): number {
    let bonus = 0;
    for (const threshold of EXTRA_HIT_LEVELS) {
        if (level >= threshold) bonus++;
    }
    return bonus;
}

// 서버가 사망을 확정한 몬스터 한 마리당 마지막 타격자에게 한 번만 호출합니다.
export function rewardMonsterKill(player: PlayerState, experienceReward = XP_PER_KILL): void {
    if (!Number.isSafeInteger(experienceReward) || experienceReward < 0) {
        throw new RangeError("Kill reward must be a non-negative integer");
    }
    player.killCount = Math.min(MAX_UINT32, player.killCount + 1);
    const maxExperience = LEVEL_XP[LEVEL_XP.length - 1];
    player.experience = Math.min(maxExperience, player.experience + experienceReward);

    let level = player.level;
    while (level < LEVEL_XP.length && player.experience >= LEVEL_XP[level]) {
        level++;
    }
    const levelsGained = level - player.level;
    if (levelsGained === 0) return;

    const gains = GAINS_PER_LEVEL[player.characterId];
    const addedHp = gains.maxHp * levelsGained;
    player.level = level;
    player.levelStartExperience = LEVEL_XP[level - 1];
    player.bonusProjectileHits = getLevelPierceBonus(level);
    player.nextLevelExperience = nextLevelExperience(level);
    player.maxHp += addedHp;
    if (player.alive && player.hp > 0) player.hp += addedHp;
    player.damage += gains.damage * levelsGained;
    player.attacksPerSecond += gains.attacksPerSecond * levelsGained;
    player.moveSpeed += gains.moveSpeed * levelsGained;
    player.projectileSpeed += gains.projectileSpeed * levelsGained;
    player.projectileRange += gains.range * levelsGained;
}
