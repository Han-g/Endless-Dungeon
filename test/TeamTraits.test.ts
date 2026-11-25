import assert from "node:assert/strict";
import { TeamTraits, healOnKill, extraTraitHits, extraHurtGrace } from "../src/game/TeamTraits.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";
import { PlayerState } from "../src/rooms/schema/PlayerState.js";
import { GameSimulation } from "../src/simulation/GameSimulation.js";
import { EnemyState } from "../src/rooms/schema/EnemyState.js";

function setup() {
    const state = new MyRoomState();
    state.game.phase = "playing";
    const a = new PlayerState(), b = new PlayerState();
    state.players.set("a", a);
    state.players.set("b", b);
    return { state, a, b, traits: new TeamTraits(state) };
}

describe("Team trait choices", () => {
    it("opens three choices per survivor, queues jumped milestones and rejects replay", () => {
        const {state, a, b, traits} = setup();
        state.game.killCount = 9;
        traits.update();
        assert.equal(a.traitDeadline, 0);
        state.game.killCount = 45;
        traits.update(() => 0);
        assert.equal(state.traitCatalog.length, 8);
        assert.deepEqual(Array.from(a.traitOptions), ["pierce", "kill_heal", "hurt_grace"]);
        assert.equal(state.nextTraitKills, 70);
        assert.equal(a.traitOfferId, 1);
        assert.ok(b.traitDeadline > 0);
        assert.equal(traits.choose("a", {offerId: 1, traitId: "bogus"}), false);
        const pick = {offerId: 1, traitId: "pierce"};
        assert.ok(traits.choose("a", pick));
        assert.equal(traits.choose("a", pick), false);
        assert.ok(traits.choose("b", {offerId: 1, traitId: "kill_heal"}));
        traits.update(() => 0);
        assert.equal(a.traitOfferId, 2);
        assert.equal(traits.choose("a", pick), false);
        state.game.elapsedSeconds = a.traitDeadline;
        assert.equal(traits.choose("a", {offerId: 2, traitId: "kill_heal"}), false);
        traits.update();
        assert.equal(extraTraitHits(a), 2);
        assert.equal(a.traitOfferId, 3);
        assert.ok(a.traitDeadline > state.game.elapsedSeconds);
        a.alive = false;
        traits.update();
        assert.equal(a.traitDeadline, 0);
        assert.equal(traits.choose("a", {offerId: 3, traitId: "pierce"}), false);
        state.game.phase = "finished";
        traits.update();
        assert.equal(b.traitDeadline, 0);
        assert.equal(a.experience, 0);
        assert.equal(b.level, 1);
    });

    it("offers further ranks to the owner until the cap and rejects unoffered traits", () => {
        const { state, a, b, traits } = setup();
        state.game.killCount = 70;
        traits.update(() => 0.999);
        assert.deepEqual(Array.from(a.traitOptions), ["healing_shot", "assist_mark", "focus_fire"]);
        assert.equal(traits.choose("a", { offerId: 1, traitId: "frost_shot" }), false);
        assert.ok(traits.choose("a", { offerId: 1, traitId: "healing_shot" }));
        assert.equal(a.traitOptions.length, 0);
        state.game.elapsedSeconds = b.traitDeadline;
        traits.update(() => 0.999);
        assert.equal(b.traitRanks.get("healing_shot"), 1); // Auto-selected the first displayed offer.
        for (const player of [a, b]) {
            assert.ok(player.traitOptions.includes("healing_shot"));
            assert.equal(new Set(player.traitOptions).size, 3);
        }
        for (const offerId of [2, 3]) {
            assert.ok(traits.choose("a", { offerId, traitId: "healing_shot" }));
            traits.update(() => 0.999);
        }
        assert.equal(a.traitRanks.get("healing_shot"), 3);
        assert.ok(!a.traitOptions.includes("healing_shot"));
        assert.equal(traits.choose("a", { offerId: 4, traitId: "healing_shot" }), false);
    });

    it("offers two, one, then zero choices when a solo survivor reaches every available cap", () => {
        const { state, a, b, traits } = setup();
        b.alive = false;
        a.traitRanks.set("pierce", 2);
        a.traitRanks.set("kill_heal", 4);
        a.traitRanks.set("hurt_grace", 3);
        a.traitRanks.set("frost_shot", 2);
        a.traitRanks.set("shield_shock", 3);
        a.traitRanks.set("focus_fire", 3);
        state.game.killCount = 70;
        traits.update(() => 0);
        assert.deepEqual(Array.from(a.traitOptions), ["kill_heal", "frost_shot"]);
        assert.equal(traits.choose("a", { offerId: 1, traitId: "pierce" }), false);
        assert.ok(traits.choose("a", { offerId: 1, traitId: "frost_shot" }));
        traits.update();
        assert.deepEqual(Array.from(a.traitOptions), ["kill_heal"]);
        state.game.elapsedSeconds = a.traitDeadline;
        traits.update();
        assert.equal(a.traitRanks.get("kill_heal"), 5);
        assert.equal(a.traitDeadline, 0);
        assert.equal(a.traitOptions.length, 0);
        assert.equal(traits.choose("a", { offerId: a.traitOfferId, traitId: "kill_heal" }), false);
        assert.equal(b.traitOptions.length, 0);
    });

    it("removes coop traits from an open choice after the last ally dies", () => {
        const { state, a, b, traits } = setup();
        state.game.killCount = 10;
        traits.update(() => 0.999);
        const deadline = a.traitDeadline;
        assert.deepEqual(Array.from(a.traitOptions), ["healing_shot", "assist_mark", "focus_fire"]);
        b.alive = false;
        assert.equal(traits.choose("a", { offerId: 1, traitId: "assist_mark" }), false);
        traits.update();
        assert.deepEqual(Array.from(a.traitOptions), ["focus_fire"]);
        assert.equal(a.traitDeadline, deadline);
        state.game.elapsedSeconds = deadline;
        traits.update();
        assert.equal(a.traitRanks.get("focus_fire"), 1);
        assert.equal(a.traitDeadline, 0);
    });

    it("accumulates 0.1 HP per kill per rank and carries progress across rank upgrades", () => {
        const { state, a, traits } = setup();
        state.game.killCount = 140;
        traits.update(() => 0);
        assert.equal(state.nextTraitKills, 180);
        assert.ok(traits.choose("a", {offerId: 1, traitId: "kill_heal"}));
        a.hp -= 5;
        for (let i = 0; i < 9; i++) healOnKill(a);
        assert.equal(a.hp, a.maxHp - 5);
        healOnKill(a);
        assert.equal(a.hp, a.maxHp - 4);
        for (let i = 0; i < 4; i++) healOnKill(a);
        traits.update(() => 0);
        assert.ok(traits.choose("a", {offerId: 2, traitId: "kill_heal"}));
        for (let i = 0; i < 2; i++) healOnKill(a);
        assert.equal(a.hp, a.maxHp - 4);
        healOnKill(a); // 4 tenths at rank 1 + 6 tenths at rank 2.
        assert.equal(a.hp, a.maxHp - 3);
        for (let i = 0; i < 5; i++) healOnKill(a);
        assert.equal(a.hp, a.maxHp - 2);
    });

    it("clamps legacy ranks and discards excess drain at full HP or death", () => {
        const { state, a, traits } = setup();
        a.hp--;
        a.traitRanks.set("kill_heal", 12);
        a.traitRanks.set("pierce", 9);
        a.traitRanks.set("hurt_grace", 8);
        assert.equal(extraTraitHits(a), 2);
        assert.ok(Math.abs(extraHurtGrace(a) - 0.45) < 1e-9);
        healOnKill(a); // Even legacy ranks above the new cap heal at most 0.5 HP per kill.
        assert.equal(a.hp, a.maxHp - 1);
        healOnKill(a);
        assert.equal(a.hp, a.maxHp);
        state.game.killCount = 10;
        traits.update();
        assert.equal(a.traitRanks.get("kill_heal"), 5);
        assert.equal(a.traitRanks.get("pierce"), 2);
        assert.equal(a.traitRanks.get("hurt_grace"), 3);
        for (let i = 0; i < 9; i++) healOnKill(a);
        a.hp -= 3;
        a.traitRanks.set("kill_heal", 1);
        for (let i = 0; i < 9; i++) healOnKill(a);
        assert.equal(a.hp, a.maxHp - 3);
        a.hp = 0;
        a.alive = false;
        for (let i = 0; i < 10; i++) healOnKill(a);
        assert.equal(a.hp, 0);
    });

    it("credits fractional drain only to the living player who lands the killing hit", () => {
        const state = new MyRoomState();
        const sim = new GameSimulation(state);
        state.game.phase = "playing";
        const shooter = new PlayerState();
        const ally = new PlayerState();
        state.players.set("shooter", shooter);
        state.players.set("ally", ally);
        for (const p of [shooter, ally]) {
            p.hp -= 5;
            p.traitRanks.set("kill_heal", 1);
            for (let i = 0; i < 9; i++) healOnKill(p);
        }
        sim.projectileSystem.setAttackInput("shooter", {aimX: 1, aimY: 0});
        sim.projectileSystem.update(0);
        const shot = state.projectiles.get("projectile-1")!;
        const target = new EnemyState();
        target.x = shot.x;
        target.y = shot.y;
        target.hp = target.maxHp = 1;
        state.enemies.set("target", target);
        sim.combatSystem.update(50);
        assert.equal(shooter.killCount, 1);
        assert.equal(shooter.hp, shooter.maxHp - 4);
        assert.equal(ally.hp, ally.maxHp - 5);
    });

    it("applies pierce on new shots and grace to real enemy contact", () => {
        const state = new MyRoomState();
        const sim = new GameSimulation(state);
        state.game.phase = "playing";
        const a = new PlayerState();
        state.players.set("a", a);
        a.traitRanks.set("pierce", 2);
        a.traitRanks.set("hurt_grace", 1);
        sim.projectileSystem.setAttackInput("a", {aimX: 1, aimY: 0});
        sim.projectileSystem.update(0);
        assert.equal(sim.projectileSystem.getRuntimeProjectile("projectile-1")!.remainingHitCount, 3);
        const enemy = new EnemyState();
        enemy.hp = enemy.maxHp = 30;
        state.enemies.set("touch", enemy);
        sim.combatSystem.update(50);
        const afterHit = a.hp;
        assert.ok(afterHit < a.maxHp);
        state.game.elapsedSeconds = 0.8;
        sim.combatSystem.update(50);
        assert.equal(a.hp, afterHit);
        state.game.elapsedSeconds = 0.75 + extraHurtGrace(a) + 0.01;
        sim.combatSystem.update(50);
        assert.ok(a.hp < afterHit);
    });
});
