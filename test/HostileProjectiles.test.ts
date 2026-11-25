import assert from "node:assert/strict";
import { EnemyState } from "../src/rooms/schema/EnemyState.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";
import { PlayerState } from "../src/rooms/schema/PlayerState.js";
import { CombatSystem } from "../src/simulation/CombatSystem.js";
import { ENEMY_CONFIGS } from "../src/simulation/EnemyCatalog.js";
import { EnemySystem } from "../src/simulation/EnemySystem.js";
import { MapCollision } from "../src/simulation/MapCollision.js";
import { ProjectileSystem } from "../src/simulation/ProjectileSystem.js";

function setup() {
    const state = new MyRoomState();
    const map = new MapCollision();
    const projectiles = new ProjectileSystem(state, map);
    const enemies = new EnemySystem(state, map);
    const combat = new CombatSystem(state, enemies, projectiles);
    const attack = ENEMY_CONFIGS.get(4)?.attack;
    assert.ok(attack?.kind === "projectile");

    function player(id: string, x: number, centerY = 0.38) {
        const target = new PlayerState();
        target.x = x;
        target.y = centerY - 0.38;
        state.players.set(id, target);
        return target;
    }

    function tick(now: number) {
        state.game.elapsedSeconds = now;
        projectiles.update(100);
        combat.update(100);
    }

    return { state, map, projectiles, attack, player, tick };
}

describe("Hostile projectiles", () => {
    it("hits the first living player along the segment, ignores allies and grants no kills or XP", () => {
        const { state, projectiles, attack, player, tick } = setup();
        const far = player("far", 2.8);
        const dead = player("dead", 0.5);
        dead.alive = false;
        dead.hp = 0;
        const near = player("near", 1.6);
        const ally = new EnemyState();
        ally.typeId = 4;
        ally.hp = 1;
        ally.x = 0.8;
        ally.y = 0.38;
        state.enemies.set("ally", ally);

        projectiles.fireEnemyBolt("caster", 0, 0.38, 1, 0, { ...attack, speed: 40 });
        const bolt = Array.from(state.projectiles.values())[0];
        assert.equal(bolt.ownerSessionId, "caster");
        assert.equal(bolt.projectileTypeId, 5);
        tick(1);

        assert.equal(state.projectiles.size, 0);
        assert.equal(near.hp, near.maxHp - attack.damage);
        assert.equal(far.hp, far.maxHp);
        assert.equal(dead.hp, 0);
        assert.equal(ally.hp, 1);
        assert.ok(state.enemies.has("ally"));
        assert.equal(state.game.killCount, 0);
        assert.equal(near.experience + far.experience, 0);
    });

    it("clips a fast bolt at a thin Map1 wall while preserving hits before the wall", () => {
        const { state, map, projectiles, attack, player, tick } = setup();
        // BlockedObject 363 spans x=30.2..30.8 at this height.
        const y = -0.55;
        const fast = { ...attack, speed: 50 };
        assert.ok(map.canMoveCircle(29, y, 29, y, fast.hitRadius));
        assert.ok(map.canMoveCircle(34, y, 34, y, fast.hitRadius));
        assert.equal(map.canMoveCircle(29, y, 34, y, fast.hitRadius), false);
        const behind = player("behind-wall", 31.6, y);
        projectiles.fireEnemyBolt("caster", 29, y, 1, 0, fast);
        tick(1);
        assert.equal(behind.hp, behind.maxHp);
        assert.equal(state.projectiles.size, 0);

        const inFront = player("in-front", 29.7, y);
        projectiles.fireEnemyBolt("caster", 29, y, 1, 0, fast);
        tick(2);
        assert.equal(inFront.hp, inFront.maxHp - fast.damage);
        assert.equal(behind.hp, behind.maxHp);

        projectiles.fireEnemyBolt("caster", 30.5, y, 1, 0, fast);
        assert.equal(state.projectiles.size, 0);
    });

    it("consumes a bolt on an immune player and shares hurt_grace with contact damage in both directions", () => {
        const { state, projectiles, attack, player, tick } = setup();
        const guard = player("guard", 1.5);
        const behind = player("behind", 3);
        guard.traitRanks.set("hurt_grace", 2);
        const slime = new EnemyState();
        slime.typeId = 1;
        slime.x = guard.x;
        slime.y = guard.y;
        state.enemies.set("slime", slime);
        const contact = ENEMY_CONFIGS.get(1)!.contact!;
        const fire = () => projectiles.fireEnemyBolt("caster", 0, 0.38, 1, 0, { ...attack, speed: 40 });

        tick(1);
        const afterContact = guard.maxHp - contact.damage;
        assert.equal(guard.hp, afterContact);
        fire();
        tick(1.80); // Base protection (0.75s) has ended, two ranks extend it to 1.05s.
        assert.equal(guard.hp, afterContact);
        assert.equal(behind.hp, behind.maxHp);
        assert.equal(state.projectiles.size, 0);

        fire();
        tick(2.1);
        const afterBolt = afterContact - attack.damage;
        assert.equal(guard.hp, afterBolt);
        tick(2.9);
        assert.equal(guard.hp, afterBolt);
        tick(3.2);
        assert.equal(guard.hp, afterBolt - contact.damage);
    });

    it("expires at its range, still hits on the final segment, and frees slots at the shared cap", () => {
        const { state, projectiles, attack, player, tick } = setup();
        const short = { ...attack, speed: 40, range: 1 };
        const target = player("target", 1.8);
        for (let i = 0; i < 513; i++) {
            projectiles.fireEnemyBolt("caster", 0, 0.38, 1, 0, short);
        }
        assert.equal(state.projectiles.size, 512);
        tick(1);
        assert.equal(target.hp, target.maxHp);
        assert.equal(state.projectiles.size, 0);

        target.x = 1.2;
        target.hp = 1;
        target.velocityX = 1;
        projectiles.fireEnemyBolt("caster", 0, 0.38, 1, 0, short);
        tick(2);
        assert.equal(target.hp, 0);
        assert.equal(target.alive, false);
        assert.equal(target.velocityX, 0);
        assert.equal(state.projectiles.size, 0);
    });
});
