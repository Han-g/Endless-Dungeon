import assert from "node:assert/strict";
import { ReadyRules, type ReadyState } from "../src/rooms/ReadyRules.js";

function fixture() {
    const players = new Map([
        ["host", { characterId: 1, isReady: false }],
        ["guest", { characterId: 2, isReady: false }]
    ]);
    const state: ReadyState = {
        game: { phase: "waiting" }, hostSessionId: "host", players
    };
    return { state, players, rules: new ReadyRules(state) };
}

describe("대기방 규칙", () => {
    it("방장만 시작할 수 있고 전원이 준비해야 한다", () => {
        const { state, rules } = fixture();
        assert.equal(rules.requestStart("guest"), "NOT_HOST");
        assert.equal(rules.requestStart("host"), "NOT_ALL_READY");
        assert.equal(rules.setReady("host", true, 1), null);
        assert.equal(rules.setReady("guest", true, 2), null);
        assert.equal(rules.requestStart("host"), null);
        assert.equal(state.game.phase, "loading");
        assert.equal(rules.requestStart("host"), "NOT_WAITING");
    });

    it("캐릭터 변경은 준비 상태를 해제한다", () => {
        const { players, rules } = fixture();
        rules.setReady("guest", true, 2);
        assert.equal(rules.selectCharacter("guest", 4), null);
        assert.equal(players.get("guest")?.characterId, 4);
        assert.equal(players.get("guest")?.isReady, false);
        assert.equal(rules.selectCharacter("guest", 99), "INVALID_CHARACTER");
    });

    it("전원 로딩 후 시작하고 중복 loaded는 허용한다", () => {
        const { state, rules } = fixture();
        rules.setReady("host", true, 1);
        rules.setReady("guest", true, 2);
        rules.requestStart("host");
        assert.equal(rules.reportLoaded("host"), null);
        assert.equal(state.game.phase, "loading");
        assert.equal(rules.reportLoaded("guest"), null);
        assert.equal(state.game.phase, "playing");
        assert.equal(rules.reportLoaded("guest"), null);
        assert.equal(rules.reportLoaded("outsider"), "NOT_MEMBER");
    });

    it("로딩하지 않은 참가자가 퇴장하면 남은 인원으로 시작한다", () => {
        const { state, players, rules } = fixture();
        rules.setReady("host", true, 1);
        rules.setReady("guest", true, 2);
        rules.requestStart("host");
        rules.reportLoaded("host");
        players.delete("guest"); // 실제 WaitingRoom.onLeave의 처리 순서
        rules.memberLeft("guest");
        assert.equal(state.game.phase, "playing");
    });
});
