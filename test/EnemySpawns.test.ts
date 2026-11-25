import assert from "node:assert/strict";
import { mock } from "node:test";
import { EnemyState } from "../src/rooms/schema/EnemyState.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";
import { PlayerState } from "../src/rooms/schema/PlayerState.js";
import { getSpawnMaxHp } from "../src/simulation/EnemyCatalog.js";
import { EnemySystem } from "../src/simulation/EnemySystem.js";
import { GameSimulation } from "../src/simulation/GameSimulation.js";
import { MapCollision } from "../src/simulation/MapCollision.js";

describe("Enemy spawn phases", () => {
    it("scales spawn HP after two minutes and caps the multiplier at 2.5", () => {
        for (const [seconds, slime, bat] of [
            [0, 15, 9], [119, 15, 9], [120, 15, 9], [180, 17, 10],
            [240, 18, 11], [300, 20, 12], [600, 27, 16], [1020, 38, 23], [3600, 38, 23]
        ]) {
            assert.equal(getSpawnMaxHp(15, seconds), slime);
            assert.equal(getSpawnMaxHp(9, seconds), bat);
        }
    });

    it("keeps damaged enemies at their original HP while later waves use their spawn time", () => {
        const state = new MyRoomState();
        state.game.phase = "playing";
        const player = new PlayerState();
        player.x = -2;
        state.players.set("host", player);
        const enemies = new EnemySystem(state, new MapCollision());
        enemies.spawnOne(1);
        const original = state.enemies.get("enemy-1")!;
        original.hp -= 4;

        state.game.elapsedSeconds = 300;
        for (let tick = 0; tick < 16; tick++) enemies.update(50);
        assert.equal(original.hp, 11);
        assert.equal(original.maxHp, 15);
        assert.ok(state.enemies.size > 1);
        for (const enemy of state.enemies.values()) {
            if (enemy !== original) {
                assert.equal(enemy.maxHp, [0, 20, 12, 47, 23][enemy.typeId]);
                assert.equal(enemy.hp, enemy.maxHp);
            }
        }
    });

    it("adds fast bats to the slime pool after 60 seconds of combat", () => {
        const state = new MyRoomState();
        state.game.phase = "playing";
        const player = new PlayerState();
        player.x = -2;
        state.players.set("host", player);
        const enemies = new EnemySystem(state, new MapCollision());
        const spawned = () => Array.from(state.enemies.values());
        const advance = (firstTick: number, ticks: number) => {
            for (let i = 0; i < ticks; i++) {
                state.game.elapsedSeconds = (firstTick + i) / 20;
                enemies.update(50);
            }
        };

        // Force each side of the weighted pick through the normal spawn path.
        const roll = mock.method(Math, "random", () => 0.99);
        try {
            advance(1176, 24); // 58.80 through 59.95 seconds
            const first = spawned();
            assert.ok(first.length > 0 && first.every(enemy => enemy.typeId === 1));

            advance(1200, 16);
            const bats = spawned().filter(enemy => enemy.typeId === 2);
            assert.ok(bats.length > 0);
            assert.ok(spawned().includes(first[0]));
            assert.equal(first[0].maxHp, 15);
            assert.equal(bats[0].maxHp, 9);
            assert.equal(bats[0].hp, bats[0].maxHp);

            roll.mock.mockImplementation(() => 0);
            advance(1216, 16);
            assert.ok(spawned().filter(enemy => enemy.typeId === 1).length > first.length);

            // Compare one real chase tick from the same unobstructed start on Map1.
            player.x = -1;
            for (const enemy of [first[0], bats[0]]) {
                enemy.x = -2;
                enemy.y = 0;
            }
            advance(1232, 1);
            assert.ok(first[0].x > -2 && bats[0].x > first[0].x);
            const batSpeed = Math.hypot(bats[0].velocityX, bats[0].velocityY);
            assert.ok(Math.abs(batSpeed - 3.65) < 0.00001, `bat chase speed: ${batSpeed}`);
        } finally {
            roll.mock.restore();
        }
    });

    it("introduces the treant at 2:00 and the caster at 3:00 through weighted spawning", () => {
        const state = new MyRoomState();
        state.game.phase = "playing";
        state.players.set("host", new PlayerState());
        const system = new EnemySystem(state, new MapCollision());
        const roll = mock.method(Math, "random", () => 0.99);
        try {
            for (const [time, expectedType] of [[119, 2], [120, 3], [179, 3], [180, 4]]) {
                state.enemies.clear();
                for (let tick = 0; tick < 15; tick++) {
                    state.game.elapsedSeconds = time + tick / 20;
                    system.update(50);
                }
                assert.equal(state.enemies.size, 2);
                for (const enemy of state.enemies.values()) assert.equal(enemy.typeId, expectedType);
            }
        } finally {
            roll.mock.restore();
        }
    });
});

// A clear lane on Map1 lets these tests use the same movement and combat loop as a room.
function encounter(typeId: number, playerDistance: number) {
    const state = new MyRoomState();
    const simulation = new GameSimulation(state);
    const player = new PlayerState();
    player.x = -8 + playerDistance;
    player.y = -5;
    state.players.set("hero", player);
    const enemy = new EnemyState();
    enemy.typeId = typeId;
    enemy.x = -8;
    enemy.y = -5;
    enemy.hp = enemy.maxHp = simulation.enemySystem.getConfig(typeId)!.maxHp;
    state.enemies.set("subject", enemy);
    const advance = (ticks: number) => {
        for (let tick = 0; tick < ticks; tick++) simulation.update(50);
    };
    const bolts = () => [...state.projectiles.values()].filter(p => p.ownerSessionId === "subject");
    return { state, simulation, player, enemy, advance, bolts };
}

describe("Enemy encounters", () => {
    it("deals bat contact damage just inside the 0.44 radius but not just outside", () => {
        const { simulation, player, enemy } = encounter(2, 0.441);
        const hp = player.hp;
        // Run only combat so that chasing cannot move the bat across the boundary.
        simulation.combatSystem.update(50);
        assert.equal(player.hp, hp);
        player.x = enemy.x + 0.439;
        simulation.combatSystem.update(50);
        assert.equal(player.hp, hp - 4);
    });
    it("gives the treant heavy contact damage and one quarter of normal knockback", () => {
        const fight = encounter(3, 0.5);
        const fullHp = fight.player.hp;
        fight.advance(1);
        assert.equal(fight.player.hp, fullHp - 12);
        fight.advance(18);
        assert.equal(fight.player.hp, fullHp - 12);
        fight.advance(10);
        assert.equal(fight.player.hp, fullHp - 24);

        for (const [typeId, expected] of [[1, 0.6], [3, 0.15]]) {
            const { simulation, enemy, advance } = encounter(typeId, 5);
            const start = enemy.x;
            simulation.enemySystem.applyKnockback("subject", 1, 0);
            advance(3);
            assert.ok(Math.abs(enemy.x - start - expected) < 0.0001);
        }
    });

    it("approaches outside the caster's band and retreats at close range without contact damage", () => {
        const far = encounter(4, 8);
        far.advance(1);
        assert.ok(far.enemy.x > -8);
        const near = encounter(4, 0.35);
        const fullHp = near.player.hp;
        near.advance(1);
        assert.ok(near.enemy.x < -8);
        assert.equal(near.player.hp, fullHp);
    });

    it("locks the cast direction during windup, allowing a sidestep, and respects cooldown", () => {
        const fight = encounter(4, 5);
        const hp = fight.player.hp;
        fight.advance(4);
        assert.equal(fight.enemy.x, -8);
        assert.equal(fight.bolts().length, 0);
        fight.player.y += 2;
        fight.advance(3); // 0.30s since the first cast began on tick one.
        assert.equal(fight.bolts().length, 0);
        fight.advance(1); // First 50ms tick past the 0.325s windup.
        const [shot] = fight.bolts();
        assert.ok(shot);
        assert.equal(shot.projectileTypeId, 5);
        assert.ok(shot.directionX > 0.99 && Math.abs(shot.directionY) < 0.05);
        const laterShots = () => fight.bolts().filter(bolt => bolt !== shot);
        fight.advance(53);
        assert.equal(fight.player.hp, hp);
        assert.equal(laterShots().length, 0);
        fight.advance(1); // 54 ticks (2.70s) between shots.
        assert.equal(laterShots().length, 1);
    });

    it("resumes chasing after the caster's 0.2s recovery", () => {
        const fight = encounter(4, 5);
        fight.advance(8);
        assert.equal(fight.bolts().length, 1);
        const startX = fight.enemy.x;
        fight.player.x = startX + 8;
        fight.advance(3);
        assert.equal(fight.enemy.x, startX);
        fight.advance(2);
        assert.ok(fight.enemy.x > startX);
    });

    it("cancels a winding cast on knockback or death", () => {
        for (const interruptedBy of ["knockback", "death"]) {
            const fight = encounter(4, 5);
            fight.advance(4);
            if (interruptedBy === "knockback") {
                fight.simulation.enemySystem.applyKnockback("subject", -1, 0);
            } else {
                fight.enemy.hp = 0;
                fight.enemy.alive = false;
            }
            fight.advance(12);
            assert.equal(fight.bolts().length, 0);
        }
    });

    it("withholds fire while a wall separates the caster from a player in range", () => {
        const fight = encounter(4, 5);
        const map = fight.simulation.mapCollision;
        const canMoveCircle = map.canMoveCircle.bind(map);
        // Model a closed gate across the lane, leaving each side free for movement.
        const gate = mock.method(map, "canMoveCircle", (
            x: number, y: number, endX: number, endY: number, radius: number
        ) => Math.max(x, endX) + radius < -5 || Math.min(x, endX) - radius > -5
            ? canMoveCircle(x, y, endX, endY, radius)
            : false);
        try {
            for (let tick = 0; tick < 30; tick++) {
                fight.advance(1);
                assert.equal(fight.bolts().length, 0);
            }
        } finally {
            gate.mock.restore();
        }
    });
});
