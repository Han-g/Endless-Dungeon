import { combatTraitEffect } from "../game/CombatTraitConfig.js";
import type { EnemyState } from "../rooms/schema/EnemyState.js";
import type { MyRoomState } from "../rooms/schema/MyRoomState.js";
import type { PlayerState } from "../rooms/schema/PlayerState.js";
import type { EnemySystem } from "./EnemySystem.js";

// Cooldowns belong to a player. Focus progress belongs to a player/target pair.
export class CombatTraits {
    private readonly frostReady = new WeakMap<PlayerState, number>();
    private readonly lastShock = new WeakMap<PlayerState, number>();
    private readonly markReady = new WeakMap<PlayerState, number>();
    private readonly focusHits = new WeakMap<EnemyState, WeakMap<PlayerState, number[]>>();
    private readonly marks = new Map<EnemyState, { ownerId: string; expires: number; damage: number }>();

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
        const focusRank = player.traitRanks.get("focus_fire") ?? 0;
        if (focusRank > 0) {
            bonus += this.focusDamage(player, enemy, now, focusRank);
        }
        const mark = this.marks.get(enemy);
        if (mark && mark.ownerId !== ownerId && now < mark.expires) {
            this.clearMark(enemy);
            bonus += mark.damage;
        }
        if (!firstHit) return bonus;
        const frostRank = player.traitRanks.get("frost_shot") ?? 0;
        if (frostRank > 0 && now >= (this.frostReady.get(player) ?? 0)) {
            const frost = combatTraitEffect("frost_shot", frostRank);
            this.enemies.applyFrost(enemy, now + frost.duration, frost.slow);
            this.frostReady.set(player, now + frost.cooldown);
        }
        const markRank = player.traitRanks.get("assist_mark") ?? 0;
        if (markRank > 0 && now >= (this.markReady.get(player) ?? 0)) {
            const config = combatTraitEffect("assist_mark", markRank);
            this.marks.set(enemy, { ownerId, expires: now + config.duration, damage: config.damage });
            enemy.marked = true;
            this.markReady.set(player, now + config.cooldown);
        }
        return bonus;
    }

    private focusDamage(player: PlayerState, enemy: EnemyState, now: number, rank: number): number {
        let byPlayer = this.focusHits.get(enemy);
        if (!byPlayer) {
            byPlayer = new WeakMap();
            this.focusHits.set(enemy, byPlayer);
        }
        const config = combatTraitEffect("focus_fire", rank);
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
        const rank = player.traitRanks.get("shield_shock") ?? 0;
        if (rank <= 0) return;
        const shock = combatTraitEffect("shield_shock", rank);
        const last = this.lastShock.get(player);
        if (last !== undefined && now < last + shock.cooldown) return;
        this.lastShock.set(player, now);
        this.enemies.pushAwayFrom(player.x, player.y, shock.radius, shock.distance);
    }
}
