import assert from "node:assert/strict";
import { EnemyState } from "../src/rooms/schema/EnemyState.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";
import { PlayerState } from "../src/rooms/schema/PlayerState.js";
import { CombatSystem } from "../src/simulation/CombatSystem.js";
import { EnemySystem } from "../src/simulation/EnemySystem.js";
import { ENEMY_CONFIGS } from "../src/simulation/EnemyCatalog.js";
import { MapCollision, PLAYER_BODY_CENTER_Y } from "../src/simulation/MapCollision.js";
import { ProjectileSystem } from "../src/simulation/ProjectileSystem.js";

function arena() {
    const state = new MyRoomState();
    state.game.phase = "playing";
    const map = new MapCollision();
    const projectiles = new ProjectileSystem(state, map);
    const enemies = new EnemySystem(state, map);
    const combat = new CombatSystem(state, enemies, projectiles);
    function player(id: string, x: number, centerY = 0.5) {
        const p = new PlayerState();
        p.x = x;
        p.y = centerY - PLAYER_BODY_CENTER_Y;
        state.players.set(id, p);
        return p;
    }
    const owner = player("owner", 0);
    owner.y = 0; // Warrior fires horizontally at y + 0.5.
    function advance(ticks: number) {
        for (let i = 0; i < ticks; i++) {
            state.game.elapsedSeconds += 0.1;
            projectiles.update(100);
            combat.update(100);
        }
    }
    return { state, owner, player, projectiles, advance };
}

describe("Healing shots", () => {
    it("automatically fires every ten seconds after acquisition even without attack input", () => {
        const { state, owner, advance, player } = arena();
        advance(200);
        owner.traitRanks.set("healing_shot", 1);
        const ally = player("ally", -2);
        const dead = player("dead", 0.7);
        dead.alive = false;
        dead.hp = 0;
        ally.hp -= 20;
        advance(99);
        assert.equal(state.projectiles.size, 0);
        advance(1);
        const first = state.projectiles.get("projectile-1")!;
        assert.ok(first.isHealing);
        assert.ok(first.directionX < -0.99);
        advance(99);
        assert.equal(ally.hp, ally.maxHp - 14);
        assert.equal(state.projectiles.size, 0);
        advance(1);
        assert.equal(state.projectiles.get("projectile-2")!.isHealing, true);
    });

    it("fires the ordinary shot and the additional healing shot on the same tick using current aim", () => {
        const { state, owner, advance, player, projectiles } = arena();
        owner.traitRanks.set("healing_shot", 1);
        player("ally", -2);
        advance(99);
        projectiles.setAttackInput("owner", { aimX: 1, aimY: 0 });
        advance(1);
        const shots = [...state.projectiles.values()];
        assert.deepEqual(shots.map(s => s.isHealing), [false, true]);
        assert.ok(shots.every(s => s.directionX === 1 && s.projectileTypeId === owner.characterId));
        advance(13); // Ordinary warrior cadence (1.25s) is still active.
        assert.equal(state.projectiles.get("projectile-3")!.isHealing, false);
    });

    it("skips a full-cap interval without a burst and does not fire for a dead owner", () => {
        const { state, owner, projectiles, advance } = arena();
        owner.traitRanks.set("healing_shot", 1);
        const attack = ENEMY_CONFIGS.get(4)?.attack;
        assert.ok(attack?.kind === "projectile");
        advance(99);
        for (let i = 0; i < 512; i++) {
            projectiles.fireEnemyBolt("caster", 3, 0.38, 1, 0, { ...attack, speed: 0 });
        }
        assert.equal(state.projectiles.size, 512);
        advance(1);
        assert.equal(state.projectiles.size, 512);
        for (const id of [...state.projectiles.keys()]) projectiles.removeProjectile(id);
        advance(99);
        assert.equal(state.projectiles.size, 0);
        advance(1);
        assert.equal(state.projectiles.size, 1);
        const shot = Array.from(state.projectiles.values())[0];
        assert.ok(shot.isHealing);
        assert.equal(shot.directionX, 1); // No aim and no living teammate.
        owner.hp = 0;
        owner.alive = false;
        advance(100);
        assert.equal(state.projectiles.size, 0);
    });

    it("heals each living ally before the last enemy impact, without consuming pierce on allies", () => {
        const { state, owner, player, advance } = arena();
        owner.traitRanks.set("healing_shot", 1);
        owner.projectileSpeed = 40;
        owner.hp -= 20;
        const near = player("near", 0.9);
        const wounded = player("wounded", 1.55);
        const beyond = player("beyond", 3.4);
        near.hp -= 2;
        wounded.hp -= 20;
        beyond.hp -= 20;
        advance(100);

        const enemy = new EnemyState();
        enemy.typeId = 4;
        enemy.x = 2.4;
        enemy.y = 0.5;
        enemy.hp = enemy.maxHp = 40;
        state.enemies.set("stop", enemy);
        advance(1);
        assert.equal(near.hp, near.maxHp);
        assert.equal(wounded.hp, wounded.maxHp - 14);
        assert.equal(owner.hp, owner.maxHp - 20);
        assert.equal(beyond.hp, beyond.maxHp - 20);
        assert.equal(enemy.hp, 40 - owner.damage);
        assert.equal(state.projectiles.size, 0);
        assert.equal(state.game.killCount, 0);
    });

    it("does not heal twice on overlapping ticks or revive dead teammates", () => {
        const { state, owner, player, projectiles, advance } = arena();
        owner.traitRanks.set("healing_shot", 1);
        owner.projectileSpeed = 0.5;
        const ally = player("ally", 0.65);
        const dead = player("dead", 0.7);
        ally.hp -= 20;
        dead.alive = false;
        dead.hp = 0;
        advance(100);
        advance(4);
        assert.equal(ally.hp, ally.maxHp - 14);
        assert.equal(dead.hp, 0);
        assert.equal(state.projectiles.size, 1);
        assert.equal(projectiles.getRuntimeProjectile("projectile-1")!.remainingHitCount, 1);
    });

    it("does not grant healing across Map1's thin wall even after the weapon has passed it", () => {
        const { owner, player, advance } = arena();
        owner.x = 29;
        owner.y = -1.05;
        owner.traitRanks.set("healing_shot", 1);
        owner.projectileSpeed = 20;
        const before = player("before", 29.7, -0.55);
        const behind = player("behind", 32.5, -0.55);
        before.hp -= 20;
        behind.hp -= 20;
        advance(100);
        advance(3);
        assert.equal(before.hp, before.maxHp - 14);
        assert.equal(behind.hp, behind.maxHp - 20);
    });
});
