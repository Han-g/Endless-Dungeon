import { COMBAT_TRAITS } from "../game/CombatTraitConfig.js";
import type { EnemyState } from "../rooms/schema/EnemyState.js";
import type { MyRoomState } from "../rooms/schema/MyRoomState.js";
import type { PlayerState } from "../rooms/schema/PlayerState.js";
import type { EnemySystem } from "./EnemySystem.js";

// Cooldowns belong to a player. Focus progress belongs to a player/target pair.
export class CombatTraits {
    private readonly frostReady = new WeakMap<PlayerState, number>();
    private readonly shockReady = new WeakMap<PlayerState, number>();
    private readonly markReady = new WeakMap<PlayerState, number>();
    private readonly focusHits = new WeakMap<EnemyState, WeakMap<PlayerState, number[]>>();
    private readonly marks = new Map<EnemyState, { ownerId: string; expires: number }>();

    public constructor(private readonly state: MyRoomState, private readonly enemies: EnemySystem) {}

    public expireMarks(): void {
        for (const [enemy, mark] of this.marks) {
            if (!enemy.alive || this.state.game.elapsedSeconds >= mark.expires || !this.state.players.has(mark.ownerId)) {
                this.clearMark(enemy);
            }
        }
    }

    private clearMark(enemy: EnemyState): void {
        enemy.marked = false;
        this.marks.delete(enemy);
    }

    public onWeaponHit(ownerId: string, enemy: EnemyState, firstHit: boolean): number {
        const player = this.state.players.get(ownerId);
        if (!player?.alive) return 0;
        const now = this.state.game.elapsedSeconds;
        let bonus = 0;
        if ((player.traitRanks.get("focus_fire") ?? 0) > 0) {
            bonus += this.focusDamage(player, enemy, now);
        }
        const mark = this.marks.get(enemy);
        if (mark && mark.ownerId !== ownerId && now < mark.expires) {
            this.clearMark(enemy);
            bonus += COMBAT_TRAITS.assist_mark.damage;
        }
        if (!firstHit) return bonus;
        if ((player.traitRanks.get("frost_shot") ?? 0) > 0 && now >= (this.frostReady.get(player) ?? 0)) {
            this.enemies.applyFrost(enemy, now + COMBAT_TRAITS.frost_shot.duration);
            this.frostReady.set(player, now + COMBAT_TRAITS.frost_shot.cooldown);
        }
        if ((player.traitRanks.get("assist_mark") ?? 0) > 0 && now >= (this.markReady.get(player) ?? 0)) {
            this.marks.set(enemy, { ownerId, expires: now + COMBAT_TRAITS.assist_mark.duration });
            enemy.marked = true;
            this.markReady.set(player, now + COMBAT_TRAITS.assist_mark.cooldown);
        }
        return bonus;
    }

    private focusDamage(player: PlayerState, enemy: EnemyState, now: number): number {
        let byPlayer = this.focusHits.get(enemy);
        if (!byPlayer) {
            byPlayer = new WeakMap();
            this.focusHits.set(enemy, byPlayer);
        }
        const config = COMBAT_TRAITS.focus_fire;
        const recent = (byPlayer.get(player) ?? []).filter(time => now - time <= config.window);
        recent.push(now);
        if (recent.length >= config.hits) {
            byPlayer.delete(player);
            return config.damage;
        }
        byPlayer.set(player, recent);
        return 0;
    }

    public onPlayerHurt(player: PlayerState): void {
        const now = this.state.game.elapsedSeconds;
        if ((player.traitRanks.get("shield_shock") ?? 0) === 0 || now < (this.shockReady.get(player) ?? 0)) return;
        const shock = COMBAT_TRAITS.shield_shock;
        this.shockReady.set(player, now + shock.cooldown);
        this.enemies.pushAwayFrom(player.x, player.y, shock.radius, shock.distance);
    }
}
