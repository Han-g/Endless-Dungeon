// Times are in seconds, distances in world units and slow is a fraction of move speed.
export const COMBAT_TRAITS = {
    frost_shot: { cooldown: 5, duration: 1.2, slow: 0.2 },
    shield_shock: { cooldown: 8, radius: 1.5, distance: 5 },
    focus_fire: { window: 5, hits: 3, damage: 6 },
    assist_mark: { cooldown: 6, duration: 5, damage: 6 },
    healing_shot: { cooldown: 10, heal: 6 }
} as const;
