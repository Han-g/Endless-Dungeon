import assert from "node:assert/strict";
import { EnemyState } from "../src/rooms/schema/EnemyState.js";
import { PlayerState } from "../src/rooms/schema/PlayerState.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";
import { CombatSystem } from "../src/simulation/CombatSystem.js";
import { CombatTraits } from "../src/simulation/CombatTraits.js";
import { EnemySystem } from "../src/simulation/EnemySystem.js";
import { MapCollision } from "../src/simulation/MapCollision.js";
import { ProjectileSystem } from "../src/simulation/ProjectileSystem.js";

function encounter() {
    const state = new MyRoomState();
    state.game.phase = "playing";
    const map = new MapCollision();
    const shots = new ProjectileSystem(state, map);
    const enemies = new EnemySystem(state, map, shots);
    const combat = new CombatSystem(state, enemies, shots);

    function player(id: string, x = -8, y = -5) {
        const hero = new PlayerState();
        hero.x = x;
        hero.y = y;
        state.players.set(id, hero);
        return hero;
    }
    function enemy(id: string, x: number, y: number, typeId = 1) {
        const mob = new EnemyState();
        mob.x = x;
        mob.y = y;
        mob.typeId = typeId;
        mob.hp = mob.maxHp = 100;
        state.enemies.set(id, mob);
        return mob;
    }
    function fire(id: string) {
        shots.setAttackInput(id, { aimX: 1, aimY: 0 });
        shots.update(0);
        shots.removePlayer(id); // Stop continuous input, keep the emitted round in flight.
        shots.update(100);
        combat.update(100);
    }
    function hostile(x: number, y: number) {
        const attack = enemies.getConfig(4)?.attack;
        assert.ok(attack?.kind === "projectile");
        shots.fireEnemyBolt("caster", x, y + 0.38, 1, 0, attack);
        combat.update(50);
    }
    return { state, shots, enemies, combat, player, enemy, fire, hostile };
}

describe("Weapon hit and damage-response traits", () => {
    it("uses actual contact order for frost and mark, and does not multiply slow", () => {
        const { state, player, enemy, fire, enemies, combat } = encounter();
        const caster = player("a");
        caster.projectileSpeed = 50;
        caster.bonusProjectileHits = 1;
        caster.traitRanks.set("frost_shot", 1);
        caster.traitRanks.set("assist_mark", 1);
        const far = enemy("far", -4.9, -4.5, 2);
        const near = enemy("near", -6.5, -4.5, 2); // Inserted second, hit first.
        state.game.elapsedSeconds = 1;
        fire("a");
        assert.ok(near.slowed && near.marked);
        assert.ok(!far.slowed && !far.marked);

        // Another player can refresh the duration, but the bat still moves at 80%.
        const ally = player("b");
        ally.projectileSpeed = 50;
        ally.traitRanks.set("frost_shot", 1);
        state.game.elapsedSeconds = 1.6;
        fire("b");
        assert.equal(near.marked, false);
        for (let tick = 0; tick < 4; tick++) {
            state.game.elapsedSeconds = 2.2 + tick / 20;
            enemies.update(50);
        }
        assert.ok(Math.abs(Math.hypot(near.velocityX, near.velocityY) - 3.65 * 0.8) < 0.0001);
        state.game.elapsedSeconds = 2.81;
        enemies.update(50);
        assert.equal(near.slowed, false);
        assert.ok(Math.abs(Math.hypot(near.velocityX, near.velocityY) - 3.65) < 0.0001);
        fire("a");
        assert.ok(!near.slowed && !near.marked); // Both effects still on their own cooldown.
        state.game.elapsedSeconds = 7.1;
        fire("a");
        assert.ok(near.slowed && near.marked);
        state.game.elapsedSeconds = 12.1;
        combat.update(50);
        assert.equal(near.marked, false);
    });

    it("uses the strongest active frost rank and falls back when that source expires", () => {
        const { state, player, enemy, enemies } = encounter();
        const strong = player("strong"), weaker = player("weaker");
        strong.traitRanks.set("frost_shot", 3);
        weaker.traitRanks.set("frost_shot", 2);
        const bat = enemy("bat", -5, -5, 2);
        const traits = new CombatTraits(state, enemies);
        const speedAt = (time: number) => {
            state.game.elapsedSeconds = time;
            enemies.update(50);
            return Math.hypot(bat.velocityX, bat.velocityY);
        };
        state.game.elapsedSeconds = 1;
        traits.onWeaponHit("strong", bat, true);
        state.game.elapsedSeconds = 1.5;
        traits.onWeaponHit("weaker", bat, true);
        assert.ok(Math.abs(speedAt(1.51) - 3.65 * 0.7) < 0.0001);
        assert.ok(Math.abs(speedAt(2.21) - 3.65 * 0.75) < 0.0001);
        assert.ok(bat.slowed);
        assert.ok(Math.abs(speedAt(2.71) - 3.65) < 0.0001);
        assert.equal(bat.slowed, false);
    });

    it("uses focused fire's current rank and the marker's rank at application", () => {
        const { state, player, enemy, enemies } = encounter();
        const focus = player("focus"), marker = player("marker");
        const target = enemy("target", -5, -5);
        const traits = new CombatTraits(state, enemies);
        for (const [rank, damage] of [[2, 8], [3, 10], [99, 10]]) {
            focus.traitRanks.set("focus_fire", rank);
            assert.equal(traits.onWeaponHit("focus", target, true), 0);
            assert.equal(traits.onWeaponHit("focus", target, true), 0);
            assert.equal(traits.onWeaponHit("focus", target, true), damage);
        }
        marker.traitRanks.set("assist_mark", 2);
        traits.onWeaponHit("marker", target, true);
        marker.traitRanks.set("assist_mark", 3);
        assert.equal(traits.onWeaponHit("focus", target, true), 9);
        state.game.elapsedSeconds = 6;
        traits.onWeaponHit("marker", target, true);
        assert.equal(traits.onWeaponHit("focus", target, true), 12);
    });

    it("groups three separate weapon hits per shooter and target in a sliding five-second window", () => {
        const { state, player, enemy, enemies } = encounter();
        const alice = player("a"), bob = player("b");
        alice.traitRanks.set("focus_fire", 1);
        bob.traitRanks.set("focus_fire", 1);
        const one = enemy("one", -7, -5), two = enemy("two", -6, -5);
        const traits = new CombatTraits(state, enemies);
        function hit(t: number, id: string, target: EnemyState) {
            state.game.elapsedSeconds = t;
            return traits.onWeaponHit(id, target, true);
        }
        assert.equal(hit(0, "a", one), 0);
        assert.equal(hit(1, "b", one), 0);
        assert.equal(hit(2, "a", two), 0);
        assert.equal(hit(3, "a", one), 0);
        assert.equal(hit(5.1, "a", one), 0); // t=0 expired.
        assert.equal(hit(8, "a", one), 6); // t=3, 5.1, 8.
        assert.equal(hit(8.1, "a", one), 0);
    });

    it("consumes a teammate's mark once, crediting a lethal bonus to the shooter", () => {
        const { state, player, enemy, fire } = encounter();
        const a = player("a");
        const b = player("b");
        for (const hero of [a, b]) {
            hero.projectileSpeed = 50;
            hero.damage = 1;
        }
        a.traitRanks.set("assist_mark", 1);
        const target = enemy("target", -6, -4.5);
        target.hp = 16;
        fire("a");
        fire("a");
        assert.equal(target.hp, 14); // The marker's second hit cannot consume the mark.
        fire("b");
        assert.equal(target.hp, 7);
        assert.equal(target.marked, false);
        fire("b");
        assert.equal(target.hp, 6);
        state.game.elapsedSeconds = 6;
        fire("a");
        fire("b");
        assert.equal(target.alive, false);
        assert.equal(state.game.killCount, 1);
        assert.equal(a.killCount, 0);
        assert.equal(b.killCount, 1);
    });

    it("counts a lingering piercing projectile once toward focused fire", () => {
        const { player, enemy, shots, combat, fire } = encounter();
        const a = player("a");
        a.traitRanks.set("focus_fire", 1);
        a.bonusProjectileHits = 2;
        a.projectileSpeed = 0;
        a.damage = 1;
        const target = enemy("target", -7.7, -4.5);
        fire("a");
        for (let i = 0; i < 3; i++) {
            shots.update(50);
            combat.update(50);
        }
        assert.equal(target.hp, 99);
        fire("a");
        assert.equal(target.hp, 98);
        fire("a");
        assert.equal(target.hp, 91);
    });

    it("knocks enemies back five units only on real damage, respecting radius, cooldown and resistance", () => {
        const { state, player, enemy, enemies, hostile } = encounter();
        const guard = player("a");
        guard.traitRanks.set("shield_shock", 1);
        const slime = enemy("slime", -7.2, -5);
        const treant = enemy("treant", -6.5, -5, 3);
        const outside = enemy("outside", -6.49, -5);
        state.game.elapsedSeconds = 1;
        hostile(guard.x, guard.y);
        enemies.applyKnockback("slime", 1, 0); // A regular hit cannot truncate the shock.
        for (let i = 0; i < 3; i++) enemies.update(50);
        assert.ok(Math.abs(slime.x - (-7.2 + 5)) < 0.001);
        assert.ok(Math.abs(treant.x - (-6.5 + 1.25)) < 0.001);
        assert.ok(outside.x <= -6.49);
        slime.x = -7.2;
        state.game.elapsedSeconds = 2;
        hostile(guard.x, guard.y);
        enemies.update(50);
        assert.ok(slime.x <= -7.2);
        state.game.elapsedSeconds = 9;
        hostile(guard.x, guard.y);
        enemies.update(50);
        assert.ok(slime.x > -6);
    });

    it("reduces shield cooldown to seven and six seconds as the rank increases", () => {
        const { state, player, enemy, enemies } = encounter();
        const guard = player("guard");
        const slime = enemy("slime", -7.2, -5);
        const traits = new CombatTraits(state, enemies);
        const pushedAt = (time: number) => {
            state.game.elapsedSeconds = time;
            slime.x = -7.2;
            traits.onPlayerHurt(guard);
            for (let i = 0; i < 3; i++) enemies.update(50);
            return Math.abs(slime.x - (-7.2 + 5)) < 0.001;
        };
        guard.traitRanks.set("shield_shock", 2);
        assert.ok(pushedAt(0));
        assert.equal(pushedAt(6.99), false);
        assert.ok(pushedAt(7));
        guard.traitRanks.set("shield_shock", 3);
        assert.equal(pushedAt(12.99), false);
        assert.ok(pushedAt(13));
    });

    it("stops a shield knockback at a thin Map1 wall", () => {
        const { player, enemy, enemies, hostile } = encounter();
        const guard = player("a", 28.5, -0.55);
        guard.traitRanks.set("shield_shock", 1);
        const target = enemy("target", 29, -0.55);
        hostile(guard.x, guard.y);
        for (let i = 0; i < 3; i++) enemies.update(50);
        assert.ok(target.x > 29 && target.x < 30.2);
    });

    it("does not spend a newly acquired shield charge while the player is invulnerable", () => {
        const { state, player, enemy, enemies, hostile } = encounter();
        const guard = player("a");
        const target = enemy("target", -7.2, -5);
        hostile(guard.x, guard.y);
        const hp = guard.hp;
        guard.traitRanks.set("shield_shock", 1);
        state.game.elapsedSeconds = 0.5;
        hostile(guard.x, guard.y);
        enemies.update(50);
        assert.equal(guard.hp, hp);
        assert.ok(target.x < -7.2);
        state.game.elapsedSeconds = 0.8;
        hostile(guard.x, guard.y);
        enemies.update(50);
        assert.ok(guard.hp < hp && target.x > -6);
    });
});
