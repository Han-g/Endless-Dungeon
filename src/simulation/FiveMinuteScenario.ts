import { rewardMonsterKill } from "../game/CharacterGrowth.js";
import type { MyRoomState } from "../rooms/schema/MyRoomState.js";
import type { GameSimulation } from "./GameSimulation.js";

const START_SECONDS = 300;
const KILLS_PER_PLAYER = 50;

export function startFiveMinuteScenario(state: MyRoomState, simulation: GameSimulation): void {
    // Replay only growth and trait rewards. The last simulated kill at 4:10
    // leaves time for the normal default picks to settle before the players take control.
    for (let kill = 1; kill <= KILLS_PER_PLAYER; kill++) {
        state.game.elapsedSeconds = kill * 5;
        for (const player of state.players.values()) {
            rewardMonsterKill(player);
            state.game.killCount++;
        }
        simulation.teamTraits.update();
    }
    state.game.elapsedSeconds = START_SECONDS;
    simulation.teamTraits.update();

    // Start with one of each for comparison, then use the usual weighted spawns.
    simulation.enemySystem.spawnOne(1);
    simulation.enemySystem.spawnOne(2);
    simulation.enemySystem.spawnOne(3);
    simulation.enemySystem.spawnOne(4);
    console.info("[Scenario 5:00]", {
        elapsedSeconds: state.game.elapsedSeconds,
        teamKills: state.game.killCount,
        players: Array.from(state.players.values(), p => ({
            characterId: p.characterId, level: p.level, xp: p.experience, hp: p.hp,
            damage: p.damage, attacksPerSecond: Number(p.attacksPerSecond.toFixed(2)),
            moveSpeed: Number(p.moveSpeed.toFixed(2))
        })),
        enemies: Array.from(state.enemies.values(), e => ({ typeId: e.typeId, hp: e.hp }))
    });
}
