import assert from "node:assert/strict";
import { CHARACTER_DEFINITIONS, applyCharacterBaseStats, getCharacterDefinition, isCharacterId } from "../src/game/CharacterCatalog.js";
import { MyRoomState } from "../src/rooms/schema/MyRoomState.js";
import { PlayerState } from "../src/rooms/schema/PlayerState.js";
import { ReadyRules } from "../src/rooms/ReadyRules.js";
import { PlayerSystem } from "../src/simulation/PlayerSystem.js";
import { ProjectileSystem } from "../src/simulation/ProjectileSystem.js";
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
            player.level = level;
            const system = new ProjectileSystem(state);
            system.setAttackInput("host", { aimX: 1, aimY: 0 });
            system.update(0);
            assert.equal(system.getRuntimeProjectile("projectile-1")!.remainingHitCount,
                getCharacterDefinition(1).weapon.maxHitCount + bonus);
        }
    });
});
