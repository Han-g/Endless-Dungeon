import type { MyRoomState } from "../rooms/schema/MyRoomState.js";
import type { PlayerState } from "../rooms/schema/PlayerState.js";
import { TraitDefinitionState } from "../rooms/schema/TraitDefinitionState.js";
import { MAX_TRAIT_RANK, combatTraitEffect, type TraitId } from "./CombatTraitConfig.js";

// Cumulative team kills. After the last milestone, repeat every REPEAT_KILLS.
const MILESTONES = [10, 25, 45, 70, 100];
const REPEAT_KILLS = 40;
const CHOICE_SECONDS = 8;

const PIERCE = 1;
const TENTHS_PER_HP = 10;
const DRAIN_TENTHS_PER_RANK = 1;
// HP is synchronized as an integer. Fractional healing belongs to this player's current life.
const pendingDrainTenths = new WeakMap<PlayerState, number>();
const HURT_GRACE = 0.15;
const TRAITS: readonly { id: TraitId; title: string; describe: (rank: number) => string }[] = [
    { id: "pierce", title: "Piercing shot", describe: r => `Additional targets per shot: ${PIERCE * r}` },
    { id: "kill_heal", title: "Life drain", describe: r => `Restore ${DRAIN_TENTHS_PER_RANK * r / TENTHS_PER_HP} HP per kill.` },
    { id: "hurt_grace", title: "Second wind", describe: r => `+${(HURT_GRACE * r).toFixed(2)}s protection after a hit.` },
    { id: "frost_shot", title: "Frost shot", describe: r => {
        const e = combatTraitEffect("frost_shot", r);
        return `Slow ${Math.round(e.slow * 100)}% for ${e.duration}s. CD ${e.cooldown}s.`;
    } },
    { id: "shield_shock", title: "Shield shock", describe: r => {
        const e = combatTraitEffect("shield_shock", r);
        return `When hurt, push foes within ${e.radius} back ${e.distance}. CD ${e.cooldown}s.`;
    } },
    { id: "focus_fire", title: "Focused fire", describe: r => {
        const e = combatTraitEffect("focus_fire", r);
        return `Hit one foe ${e.hits} times in ${e.window}s for +${e.damage} damage.`;
    } },
    { id: "assist_mark", title: "Assist mark", describe: r => {
        const e = combatTraitEffect("assist_mark", r);
        return `Mark for ${e.duration}s. An ally's hit deals +${e.damage}. CD ${e.cooldown}s.`;
    } },
    { id: "healing_shot", title: "Healing shot", describe: r => {
        const e = combatTraitEffect("healing_shot", r);
        return `Every ${e.cooldown}s, fire a shot that heals allies ${e.heal} HP.`;
    } }
];

const rank = (player: PlayerState, id: TraitId) =>
    Math.min(MAX_TRAIT_RANK[id], player.traitRanks.get(id) ?? 0);

function canUpgrade(player: PlayerState, id: TraitId, hasAlly: boolean): boolean {
    if (!hasAlly && (id === "assist_mark" || id === "healing_shot")) return false;
    return rank(player, id) < MAX_TRAIT_RANK[id];
}
export const extraTraitHits = (player: PlayerState) => PIERCE * rank(player, "pierce");
export const extraHurtGrace = (player: PlayerState) => HURT_GRACE * rank(player, "hurt_grace");

export function healOnKill(player: PlayerState): void {
    if (!player.alive || player.hp <= 0 || player.hp >= player.maxHp) {
        pendingDrainTenths.delete(player);
        return;
    }
    const drainRank = rank(player, "kill_heal");
    if (drainRank === 0) return;

    const total = (pendingDrainTenths.get(player) ?? 0) + drainRank * DRAIN_TENTHS_PER_RANK;
    const heal = Math.floor(total / TENTHS_PER_HP);
    player.hp = Math.min(player.maxHp, player.hp + heal);
    pendingDrainTenths.set(player, player.hp < player.maxHp ? total % TENTHS_PER_HP : 0);
}

export class TeamTraits {
    private round = 0;
    private readonly initializedPlayers = new WeakSet<PlayerState>();

    public constructor(private readonly state: MyRoomState) {
        state.nextTraitKills = MILESTONES[0];
        for (const entry of TRAITS) {
            const definition = new TraitDefinitionState();
            definition.id = entry.id;
            definition.title = entry.title;
            definition.maxRank = MAX_TRAIT_RANK[entry.id];
            for (let r = 1; r <= definition.maxRank; r++) definition.rankDescriptions.push(entry.describe(r));
            definition.description = definition.rankDescriptions[0];
            state.traitCatalog.push(definition);
        }
    }

    public update(random: () => number = Math.random): void {
        const game = this.state.game;
        const playing = game.phase === "playing";
        if (playing && this.state.nextTraitKills > 0 && game.killCount >= this.state.nextTraitKills) {
            const last = MILESTONES[MILESTONES.length - 1];
            this.round = MILESTONES.filter(target => game.killCount >= target).length
                + Math.floor(Math.max(0, game.killCount - last) / REPEAT_KILLS);
            const next = MILESTONES[this.round] ?? last + (this.round - MILESTONES.length + 1) * REPEAT_KILLS;
            this.state.nextTraitKills = next <= 0xffffffff ? next : 0;
        }

        let survivors = 0;
        for (const player of this.state.players.values()) if (player.alive) survivors++;
        const hasAlly = survivors > 1;
        for (const player of this.state.players.values()) {
            if (!this.initializedPlayers.has(player)) {
                for (const { id } of TRAITS) {
                    if ((player.traitRanks.get(id) ?? 0) > MAX_TRAIT_RANK[id]) {
                        player.traitRanks.set(id, MAX_TRAIT_RANK[id]);
                    }
                }
                this.initializedPlayers.add(player);
            }
            if (!playing || !player.alive) {
                // Skip pending and missed offers on death. Never grant a posthumous selection.
                player.traitDeadline = 0;
                player.traitOfferId = this.round;
                if (player.traitOptions.length) player.traitOptions.clear();
                continue;
            }
            if (player.traitDeadline > 0) {
                const options = player.traitOptions;
                for (let i = options.length - 1; i >= 0; i--) {
                    const entry = TRAITS.find(t => t.id === options[i]);
                    if (!entry || !canUpgrade(player, entry.id, hasAlly)) options.splice(i, 1);
                }
                if (!options.length) player.traitDeadline = 0;
                else if (game.elapsedSeconds >= player.traitDeadline) {
                    this.grant(player, options[0] as TraitId);
                }
            }
            // A burst of kills can earn several rounds. Each opens its own full window.
            if (player.traitDeadline === 0 && player.traitOfferId < this.round) {
                this.drawOptions(player, hasAlly, random);
                if (!player.traitOptions.length) {
                    player.traitOfferId = this.round;
                    continue;
                }
                player.traitOfferId++;
                player.traitDeadline = game.elapsedSeconds + CHOICE_SECONDS;
            }
        }
    }

    private drawOptions(player: PlayerState, hasAlly: boolean, random: () => number): void {
        const pool = TRAITS.filter(trait => canUpgrade(player, trait.id, hasAlly));
        player.traitOptions.clear();
        while (pool.length && player.traitOptions.length < 3) {
            const index = Math.floor(random() * pool.length);
            player.traitOptions.push(pool.splice(index, 1)[0].id);
        }
    }

    public choose(sessionId: string, message: unknown): boolean {
        const player = this.state.players.get(sessionId);
        if (this.state.game.phase !== "playing" || !player?.alive || player.traitDeadline === 0 ||
            this.state.game.elapsedSeconds >= player.traitDeadline || !message || typeof message !== "object") {
            return false;
        }
        const { offerId, traitId } = message as { offerId?: unknown; traitId?: unknown };
        const selected = TRAITS.find(entry => entry.id === traitId);
        if (offerId !== player.traitOfferId || !selected || !player.traitOptions.includes(selected.id)) return false;
        const hasAlly = Array.from(this.state.players.values()).some(other => other !== player && other.alive);
        if (!canUpgrade(player, selected.id, hasAlly)) return false;
        this.grant(player, selected.id);
        return true;
    }

    private grant(player: PlayerState, id: TraitId): void {
        player.traitRanks.set(id, rank(player, id) + 1);
        player.lastTraitId = id;
        player.traitDeadline = 0;
        player.traitOptions.clear();
    }
}
