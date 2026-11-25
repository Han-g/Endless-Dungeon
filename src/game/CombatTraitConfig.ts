// Each row corresponds to a learned rank, starting at one.
const combatRanks = {
    frost_shot: [0.20, 0.25, 0.30].map(slow => ({ cooldown: 5, duration: 1.2, slow })),
    shield_shock: [8, 7, 6].map(cooldown => ({ cooldown, radius: 1.5, distance: 5 })),
    focus_fire: [6, 8, 10].map(damage => ({ window: 5, hits: 3, damage })),
    assist_mark: [6, 9, 12].map(damage => ({ cooldown: 6, duration: 5, damage })),
    healing_shot: [6, 9, 12].map(heal => ({ cooldown: 10, heal }))
} as const;

export const MAX_TRAIT_RANK = {
    pierce: 2, kill_heal: 5, hurt_grace: 3,
    frost_shot: combatRanks.frost_shot.length, shield_shock: combatRanks.shield_shock.length,
    focus_fire: combatRanks.focus_fire.length, assist_mark: combatRanks.assist_mark.length,
    healing_shot: combatRanks.healing_shot.length
} as const;

export type TraitId = keyof typeof MAX_TRAIT_RANK;
type CombatTraitId = keyof typeof combatRanks;
type Effect<K extends CombatTraitId> = (typeof combatRanks)[K][number];

// Callers check ownership before requesting the effect. Legacy ranks above the cap use the last row.
export function combatTraitEffect<K extends CombatTraitId>(id: K, rank: number): Effect<K> {
    const rows = combatRanks[id];
    return rows[Math.min(rows.length, Math.max(1, rank)) - 1];
}

// Baseline values for callers that need the rank-independent timings and distances.
export const COMBAT_TRAITS = {
    frost_shot: combatRanks.frost_shot[0], shield_shock: combatRanks.shield_shock[0],
    focus_fire: combatRanks.focus_fire[0], assist_mark: combatRanks.assist_mark[0],
    healing_shot: combatRanks.healing_shot[0]
};
