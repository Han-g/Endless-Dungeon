import assert from "node:assert/strict";
import { mock } from "node:test";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";
import { PlayerState } from "../src/rooms/schema/PlayerState.js";
import { EnemySystem } from "../src/simulation/EnemySystem.js";
import { MapCollision } from "../src/simulation/MapCollision.js";

describe("Enemy spawn phases", () => {
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
            assert.ok(bats[0].hp === bats[0].maxHp && bats[0].maxHp < first[0].maxHp);

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
        } finally {
            roll.mock.restore();
        }
    });
});
