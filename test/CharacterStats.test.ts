import assert from "node:assert/strict";
import { CHARACTER_DEFINITIONS, applyCharacterBaseStats, getCharacterDefinition, isCharacterId } from "../src/game/CharacterCatalog.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";
import { PlayerState } from "../src/rooms/schema/PlayerState.js";
import { ReadyRules } from "../src/rooms/ReadyRules.js";
import { PlayerSystem } from "../src/simulation/PlayerSystem.js";
import { ProjectileSystem } from "../src/simulation/ProjectileSystem.js";
import { GAINS_PER_LEVEL, LEVEL_XP, rewardMonsterKill } from "../src/game/CharacterGrowth.js";
import { startFiveMinuteScenario } from "../src/simulation/FiveMinuteScenario.js";
import { GameSimulation } from "../src/simulation/GameSimulation.js";
import { MapCollision } from "../src/simulation/MapCollision.js";

function fixture() {
    const state = new MyRoomState();
    state.game.phase = "waiting";
    state.hostSessionId = "host";
    const player = new PlayerState();
    state.players.set("host", player);
    return { state, player, rules: new ReadyRules(state) };
}

function close(actual: number, expected: number) {
    assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);
}

describe("캐릭터 기본 능력치", () => {
    it("직업별 1레벨 기본 공격 피해에 따라 체력 15인 슬라임을 처치한다", () => {
        for (const definition of CHARACTER_DEFINITIONS) {
            const { state, player } = fixture();
            applyCharacterBaseStats(player, definition.id);
            player.x = -2;
            state.game.phase = "playing";
            const game = new GameSimulation(state);
            for (let tick = 0; tick < 24; tick++) game.enemySystem.update(50);
            assert.equal(state.enemies.size, 1);
            const slime = state.enemies.get("enemy-1")!;
            assert.equal(slime.typeId, 1);
            assert.equal(slime.hp, slime.maxHp);
            assert.equal(slime.maxHp, 15);
            slime.x = player.x + definition.weapon.spawnDistance;
            slime.y = player.y + definition.weapon.originOffsetY;

            game.projectileSystem.setAttackInput("host", { aimX: 1, aimY: 0 });
            game.projectileSystem.update(0);
            assert.equal(state.projectiles.size, 1);
            game.combatSystem.update(50);
            const afterFirstHit = Math.max(0, 15 - definition.weapon.damage);
            assert.equal(slime.hp, afterFirstHit);
            assert.equal(state.enemies.has("enemy-1"), afterFirstHit > 0);
            if (afterFirstHit > 0) {
                assert.equal(player.killCount, 0);
                const ticksToNextShot = Math.ceil(1000 / (50 * player.attacksPerSecond)) + 1;
                for (let tick = 0; tick < ticksToNextShot && slime.alive; tick++) {
                    game.projectileSystem.update(50);
                    game.combatSystem.update(50);
                }
            }
            assert.equal(state.enemies.size, 0);
            assert.equal(player.killCount, 1);
        }
    });

    it("준비 완료와 별도 캐릭터 선택 모두 체력과 이동속도를 적용한다", () => {
        const { player, rules } = fixture();
        for (const definition of CHARACTER_DEFINITIONS) {
            player.hp = 1;
            assert.equal(rules.setReady("host", true, definition.id), null);
            assert.equal(player.characterId, definition.id);
            assert.equal(player.hp, definition.maxHp);
            assert.equal(player.maxHp, definition.maxHp);
            close(player.moveSpeed, definition.moveSpeed);
            assert.equal(player.isReady, true);
            player.hp = 1;
            assert.equal(rules.selectCharacter("host", definition.id), null);
            assert.equal(player.hp, definition.maxHp);
            assert.equal(player.isReady, false);
            close(player.moveSpeed, definition.moveSpeed);
        }
    });

    it("잘못된 ID와 진행 중 선택은 상태를 바꾸지 않고 준비 취소는 회복시키지 않는다", () => {
        const { state, player, rules } = fixture();
        applyCharacterBaseStats(player, 3);
        player.hp = 7;
        const before = player.toJSON();
        for (const id of [0, 5, 1.5, NaN, Infinity, "1", null, undefined]) {
            assert.equal(isCharacterId(id), false);
            assert.equal(rules.setReady("host", true, id), "INVALID_CHARACTER");
            assert.equal(rules.selectCharacter("host", id), "INVALID_CHARACTER");
        }
        assert.throws(() => getCharacterDefinition(99));
        assert.throws(() => applyCharacterBaseStats(player, 99));
        assert.deepEqual(player.toJSON(), before);
        assert.equal(rules.setReady("host", false, undefined), null);
        assert.equal(player.hp, 7);
        state.game.phase = "playing";
        assert.equal(rules.setReady("host", true, 1), "NOT_WAITING");
        assert.equal(rules.selectCharacter("host", 1), "NOT_WAITING");
        assert.deepEqual(player.toJSON(), before);
    });

    it("실제 이동 계산은 캐릭터 속도와 플레이어의 현재 속도를 사용한다", () => {
        const map = new MapCollision();
        for (const definition of CHARACTER_DEFINITIONS) {
            const { state, player } = fixture();
            applyCharacterBaseStats(player, definition.id);
            player.x = -2;
            const system = new PlayerSystem(state, map);
            system.setMoveInput("host", { x: 1, y: 0, sequence: 1 });
            system.update(50);
            close(player.x, -2 + definition.moveSpeed * 0.05);
            close(player.velocityX, definition.moveSpeed);
            player.moveSpeed = 2;
            const previousX = player.x;
            system.update(50);
            close(player.x - previousX, 0.1);
            close(player.velocityX, 2);
        }
    });

    it("생성된 투사체는 기준표의 피해량·속도·사거리·기본 적중 수를 사용한다", () => {
        for (const definition of CHARACTER_DEFINITIONS) {
            const { state, player } = fixture();
            applyCharacterBaseStats(player, definition.id);
            const system = new ProjectileSystem(state);
            system.setAttackInput("host", { aimX: 1, aimY: 0 });
            system.update(0);
            assert.equal(state.projectiles.size, 1);
            const projectile = state.projectiles.get("projectile-1")!;
            const runtime = system.getRuntimeProjectile("projectile-1")!;
            assert.equal(projectile.projectileTypeId, definition.weapon.projectileTypeId);
            assert.equal(runtime.damage, definition.weapon.damage);
            assert.equal(runtime.speed, definition.weapon.speed);
            assert.equal(runtime.remainingDistance, definition.weapon.range);
            assert.equal(runtime.remainingHitCount, definition.weapon.maxHitCount);
            const previousX = projectile.x;
            system.update(100);
            close(projectile.x - previousX, definition.weapon.speed * 0.1);
            assert.equal(state.projectiles.size, 1);
        }
    });

    it("기본 적중 수 통일 후에도 기존 레벨 관통 보너스를 유지한다", () => {
        for (const [level, bonus] of [[1, 0], [3, 1], [5, 2], [8, 3]]) {
            const { state, player } = fixture();
            applyCharacterBaseStats(player, 1);
            if (level > 1) rewardMonsterKill(player, LEVEL_XP[level - 1]);
            assert.equal(player.levelStartExperience, LEVEL_XP[level - 1]);
            assert.equal(player.bonusProjectileHits, bonus);
            const system = new ProjectileSystem(state);
            system.setAttackInput("host", { aimX: 1, aimY: 0 });
            system.update(0);
            assert.equal(system.getRuntimeProjectile("projectile-1")!.remainingHitCount,
                getCharacterDefinition(1).weapon.maxHitCount + bonus);
        }
    });
});

describe("처치 경험치와 직업 성장", () => {
    it("5분 시나리오가 네 직업의 처치 성장과 이미 지난 팀 보상을 함께 복원한다", () => {
        const state = new MyRoomState();
        state.game.phase = "playing";
        for (const def of CHARACTER_DEFINITIONS) {
            const player = new PlayerState();
            applyCharacterBaseStats(player, def.id);
            player.x = -2;
            state.players.set(String(def.id), player);
        }
        startFiveMinuteScenario(state, new GameSimulation(state));
        assert.equal(state.game.elapsedSeconds, 300);
        assert.equal(state.game.killCount, 200);
        assert.equal(state.nextTraitKills, 220);
        for (const p of state.players.values()) {
            const base = getCharacterDefinition(p.characterId);
            const gain = GAINS_PER_LEVEL[p.characterId];
            assert.equal(p.killCount, 50);
            assert.equal(p.experience, 500);
            assert.equal(p.level, 3);
            assert.equal(p.levelStartExperience, LEVEL_XP[2]);
            assert.equal(p.nextLevelExperience, LEVEL_XP[3]);
            assert.equal(p.bonusProjectileHits, 1);
            assert.equal(p.maxHp, base.maxHp + 2 * gain.maxHp);
            assert.equal(p.hp, p.maxHp);
            assert.equal(p.damage, base.weapon.damage + 2 * gain.damage);
            close(p.attacksPerSecond, base.weapon.attacksPerSecond + 2 * gain.attacksPerSecond);
            close(p.moveSpeed, base.moveSpeed + 2 * gain.moveSpeed);
            close(p.projectileRange, base.weapon.range + 2 * gain.range);
            close(p.projectileSpeed, base.weapon.speed + 2 * gain.projectileSpeed);
            assert.equal(p.traitRanks.get("pierce"), 2);
            assert.equal(p.traitRanks.get("kill_heal"), 5);
            assert.equal(p.traitDeadline, 0);
        }
    });

    it("레벨 1부터 만렙까지 전사는 체력, 마법사는 단발 피해, 도적은 기동력, 궁수는 연사에 앞선다", () => {
        const makePlayer = (id: number) => {
            const player = new PlayerState();
            applyCharacterBaseStats(player, id);
            return player;
        };
        const party = [1, 2, 3, 4].map(makePlayer);
        const [warrior, archer, rogue, mage] = party;
        for (const [index, threshold] of LEVEL_XP.entries()) {
            for (const player of party) {
                if (index > 0) rewardMonsterKill(player, threshold - player.experience);
                assert.equal(player.level, index + 1);
            }
            assert.ok(warrior.maxHp > Math.max(archer.maxHp, rogue.maxHp, mage.maxHp));
            assert.ok(mage.damage > warrior.damage && warrior.damage > Math.max(archer.damage, rogue.damage));
            assert.ok(archer.attacksPerSecond > rogue.attacksPerSecond &&
                rogue.attacksPerSecond > Math.max(warrior.attacksPerSecond, mage.attacksPerSecond));
            assert.ok(rogue.moveSpeed > archer.moveSpeed && archer.moveSpeed > Math.max(warrior.moveSpeed, mage.moveSpeed));
        }
    });

    it("누적 경계에서만 강화하고 여러 레벨을 건너뛴 보상도 모두 적용한다", () => {
        const { player } = fixture();
        const base = getCharacterDefinition(1);
        const gains = GAINS_PER_LEVEL[1];
        player.hp -= 35;
        rewardMonsterKill(player, LEVEL_XP[1] - 1);
        assert.equal(player.level, 1);
        assert.equal(player.hp, base.maxHp - 35);
        rewardMonsterKill(player, 1);
        assert.equal(player.level, 2);
        assert.equal(player.nextLevelExperience, LEVEL_XP[2]);
        assert.equal(player.hp, base.maxHp - 35 + gains.maxHp);
        rewardMonsterKill(player, LEVEL_XP[4] - LEVEL_XP[1] + 1);
        assert.equal(player.level, 5);
        assert.equal(player.experience, LEVEL_XP[4] + 1);
        assert.equal(player.maxHp, base.maxHp + 4 * gains.maxHp);
        assert.equal(player.damage, base.weapon.damage + 4 * gains.damage);
        assert.equal(player.hp, player.maxHp - 35);
        assert.equal(player.killCount, 3);
    });

    it("최고 레벨 이후에는 처치 수만 증가하며 사후 처치가 부활시키지 않는다", () => {
        const { player } = fixture();
        player.hp = 0;
        player.alive = false;
        const cap = LEVEL_XP[LEVEL_XP.length - 1];
        rewardMonsterKill(player, cap + 1);
        assert.equal(player.hp, 0);
        assert.equal(player.alive, false);
        assert.equal(player.level, LEVEL_XP.length);
        assert.equal(player.experience, cap);
        assert.equal(player.levelStartExperience, cap);
        assert.equal(player.nextLevelExperience, 0);
        const hp = player.maxHp;
        rewardMonsterKill(player);
        assert.equal(player.experience, cap);
        assert.equal(player.maxHp, hp);
        assert.equal(player.killCount, 2);
    });

    it("직업 성장값이 실제 이동 거리·투사체·다음 발사 간격에 반영된다", () => {
        const map = new MapCollision();
        for (const base of CHARACTER_DEFINITIONS) {
            const { state, player } = fixture();
            applyCharacterBaseStats(player, base.id);
            player.x = -2;
            const shots = new ProjectileSystem(state);
            shots.setAttackInput("host", { aimX: 1, aimY: 0 });
            shots.update(0);
            const original = shots.getRuntimeProjectile("projectile-1")!;
            rewardMonsterKill(player, LEVEL_XP[1]);
            const gain = GAINS_PER_LEVEL[base.id];
            assert.equal(original.damage, base.weapon.damage);
            assert.equal(original.speed, base.weapon.speed);
            close(player.attacksPerSecond, base.weapon.attacksPerSecond + gain.attacksPerSecond);

            const move = new PlayerSystem(state, map);
            move.setMoveInput("host", { x: 1, y: 0, sequence: 1 });
            move.update(50);
            close(player.x + 2, (base.moveSpeed + gain.moveSpeed) * 0.05);

            // 직전 발사의 쿨다운은 유지되고, 다음 발사부터 강화된 수치를 사용합니다.
            const oldCooldownTicks = Math.ceil(1 / base.weapon.attacksPerSecond / 0.05);
            for (let tick = 0; tick <= oldCooldownTicks && !shots.getRuntimeProjectile("projectile-2"); tick++) {
                shots.update(50);
            }
            const upgraded = shots.getRuntimeProjectile("projectile-2")!;
            assert.equal(upgraded.damage, base.weapon.damage + gain.damage);
            close(upgraded.speed, base.weapon.speed + gain.projectileSpeed);
            close(upgraded.remainingDistance, base.weapon.range + gain.range);
            const expectedInterval = 1 / (base.weapon.attacksPerSecond + gain.attacksPerSecond);
            const ticks = Math.ceil(expectedInterval / 0.01);
            for (let i = 1; i < ticks; i++) shots.update(10);
            assert.equal(shots.getRuntimeProjectile("projectile-3"), undefined);
            shots.update(10);
            shots.update(10); // 부동소수점 경계에서 1틱 허용
            assert.ok(shots.getRuntimeProjectile("projectile-3"));
        }
    });
});
