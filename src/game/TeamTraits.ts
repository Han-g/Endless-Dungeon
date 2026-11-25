import type { MyRoomState } from "../rooms/schema/MyRoomState.js";
import type { PlayerState } from "../rooms/schema/PlayerState.js";
import { TraitDefinitionState } from "../rooms/schema/TraitDefinitionState.js";
import { COMBAT_TRAITS } from "./CombatTraitConfig.js";

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
const TRAITS = [
    { id: "pierce", title: "Piercing shot", description: "+" + PIERCE + " target per projectile" },
    { id: "kill_heal", title: "Life drain", description: "+" + (DRAIN_TENTHS_PER_RANK / TENTHS_PER_HP) + " HP per kill per rank" },
    { id: "hurt_grace", title: "Second wind", description: "+" + HURT_GRACE + "s protection after a hit" },
    { id: "frost_shot", title: "Frost shot", description: `First hit slows ${Math.round(COMBAT_TRAITS.frost_shot.slow * 100)}% for ${COMBAT_TRAITS.frost_shot.duration}s. CD ${COMBAT_TRAITS.frost_shot.cooldown}s.` },
    { id: "shield_shock", title: "Shield shock", description: `On hit: push foes within ${COMBAT_TRAITS.shield_shock.radius} back ${COMBAT_TRAITS.shield_shock.distance}. CD ${COMBAT_TRAITS.shield_shock.cooldown}s.` },
    { id: "focus_fire", title: "Focused fire", description: `Hit one foe ${COMBAT_TRAITS.focus_fire.hits} times in ${COMBAT_TRAITS.focus_fire.window}s for +${COMBAT_TRAITS.focus_fire.damage} damage.` },
    { id: "assist_mark", title: "Assist mark", description: `Mark for ${COMBAT_TRAITS.assist_mark.duration}s. An ally's hit deals +${COMBAT_TRAITS.assist_mark.damage}. CD ${COMBAT_TRAITS.assist_mark.cooldown}s.` },
    { id: "healing_shot", title: "Healing shot", description: `Every ${COMBAT_TRAITS.healing_shot.cooldown}s, fire a shot that heals allies ${COMBAT_TRAITS.healing_shot.heal} HP.` }
] as const;

type TraitId = typeof TRAITS[number]["id"];
const rank = (player: PlayerState, id: TraitId) => player.traitRanks.get(id) ?? 0;
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

    public constructor(private readonly state: MyRoomState) {
        state.nextTraitKills = MILESTONES[0];
        for (const entry of TRAITS) {
            state.traitCatalog.push(Object.assign(new TraitDefinitionState(), entry));
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

        for (const player of this.state.players.values()) {
            if (!playing || !player.alive) {
                // Skip pending and missed offers on death. Never grant a posthumous selection.
                player.traitDeadline = 0;
                player.traitOfferId = this.round;
                if (player.traitOptions.length) player.traitOptions.clear();
                continue;
            }
            if (player.traitDeadline > 0 && game.elapsedSeconds >= player.traitDeadline) {
                const fallback = TRAITS.find(trait => trait.id === player.traitOptions[0]);
                if (fallback) this.grant(player, fallback.id);
            }
            // A burst of kills can earn several rounds. Each opens its own full window.
            if (player.traitDeadline === 0 && player.traitOfferId < this.round) {
                this.drawOptions(player, random);
                player.traitOfferId++;
                player.traitDeadline = game.elapsedSeconds + CHOICE_SECONDS;
            }
        }
    }

    private drawOptions(player: PlayerState, random: () => number): void {
        const hasAlly = Array.from(this.state.players.values()).some(other => other !== player && other.alive);
        const pool = TRAITS.filter(trait => {
            if ((trait.id === "assist_mark" || trait.id === "healing_shot") && !hasAlly) return false;
            return !(trait.id in COMBAT_TRAITS) || !player.traitRanks.has(trait.id);
        });
        player.traitOptions.clear();
        while (player.traitOptions.length < 3) {
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
