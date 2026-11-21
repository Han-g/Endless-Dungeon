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
        traits.update();
        assert.equal(state.traitCatalog.length, 3);
        assert.equal(state.nextTraitKills, 70);
        assert.equal(a.traitOfferId, 1);
        assert.ok(b.traitDeadline > 0);
        assert.equal(traits.choose("a", {offerId: 1, traitId: "bogus"}), false);
        const pick = {offerId: 1, traitId: "pierce"};
        assert.ok(traits.choose("a", pick));
        assert.equal(traits.choose("a", pick), false);
        assert.ok(traits.choose("b", {offerId: 1, traitId: "kill_heal"}));
        traits.update();
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

    it("caps healing at max HP, never revives and repeats the team goal after 100", () => {
        const { state, a, traits } = setup();
        state.game.killCount = 140;
        traits.update();
        assert.equal(state.nextTraitKills, 180);
        assert.ok(traits.choose("a", {offerId: 1, traitId: "kill_heal"}));
        a.hp -= 5;
        healOnKill(a);
        assert.equal(a.hp, a.maxHp - 3);
        traits.update();
        assert.ok(traits.choose("a", {offerId: 2, traitId: "kill_heal"}));
        healOnKill(a);
        assert.equal(a.hp, a.maxHp);
        a.hp = 0; a.alive = false;
        healOnKill(a);
        assert.equal(a.hp, 0);
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
        assert.equal(sim.projectileSystem.getRuntimeProjectile("projectile-1")!.remainingHitCount, 4);
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
