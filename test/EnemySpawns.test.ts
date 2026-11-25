import assert from "node:assert/strict";
import { mock } from "node:test";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";
import { PlayerState } from "../src/rooms/schema/PlayerState.js";
import { getSpawnMaxHp } from "../src/simulation/EnemyCatalog.js";
import { EnemySystem } from "../src/simulation/EnemySystem.js";
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
                assert.equal(enemy.maxHp, enemy.typeId === 1 ? 20 : 12);
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
});
