import type { MyRoomState } from "../rooms/schema/MyRoomState.js";
import type { PlayerState } from "../rooms/schema/PlayerState.js";
import { TraitDefinitionState } from "../rooms/schema/TraitDefinitionState.js";

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
    { id: "hurt_grace", title: "Second wind", description: "+" + HURT_GRACE + "s protection after a hit" }
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

    public update(): void {
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
                continue;
            }
            if (player.traitDeadline > 0 && game.elapsedSeconds >= player.traitDeadline) {
                this.grant(player, TRAITS[0].id);
            }
            // A burst of kills can earn several rounds. Each opens its own full window.
            if (player.traitDeadline === 0 && player.traitOfferId < this.round) {
                player.traitOfferId++;
                player.traitDeadline = game.elapsedSeconds + CHOICE_SECONDS;
            }
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
        if (offerId !== player.traitOfferId || !selected) return false;
        this.grant(player, selected.id);
        return true;
    }

    private grant(player: PlayerState, id: TraitId): void {
        player.traitRanks.set(id, rank(player, id) + 1);
        player.lastTraitId = id;
        player.traitDeadline = 0;
    }
}
