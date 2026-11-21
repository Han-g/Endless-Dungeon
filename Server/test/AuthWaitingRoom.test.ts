import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import { Client, type Room as SDKRoom } from "@colyseus/sdk";
import { matchMaker, type Server } from "colyseus";
import { AuthService } from "../src/auth/AuthService.js";
import { AuthError } from "../src/auth/contracts.js";
import { authRuntime } from "../src/auth/runtime.js";
import type { WaitingRoom } from "../src/rooms/WaitingRoom.js";

interface Result { requestId: string; ok: boolean; error: string; }
const password = "Integration!Password123";
const accounts = Array.from({ length: 5 }, (_, i) => `test_user_${i}`);
const connections = new Set<SDKRoom<any, any>>();
let mongo: MongoMemoryServer;
let inspector: MongoClient;
let gameServer: Server;
let endpoint: string;
let database: string;
let dbDirectory: string;
let tokens: string[];
const cacheDirectory = resolve(".cache");
const originalUri = process.env.MONGODB_URI;
const originalDb = process.env.MONGODB_DB;

async function eventually(check: () => boolean, message: string): Promise<void> {
    const until = Date.now() + 5000;
    while (!check()) {
        if (Date.now() > until) assert.fail(message);
        await delay(15);
    }
}

function client(token?: string): Client {
    const sdk = new Client(endpoint);
    if (token) sdk.auth.token = token;
    return sdk;
}

function track<T extends SDKRoom<any, any>>(room: T): T {
    room.reconnection.enabled = false;
    room.onError(() => {});
    room.onMessage("*", () => {});
    connections.add(room);
    room.onLeave(() => connections.delete(room));
    return room;
}

function closed(room: SDKRoom<any, any>): Promise<number> {
    return new Promise((resolveClose, reject) => {
        const timer = setTimeout(() => reject(new Error("SOCKET_DID_NOT_CLOSE")), 5000);
        room.onLeave.once(code => { clearTimeout(timer); resolveClose(code); });
    });
}

function command(
    room: SDKRoom<any, any>, type: string, body: Record<string, unknown> = {},
    requestId = randomUUID().replaceAll("-", "")
): Promise<Result> {
    return new Promise((resolveResult, reject) => {
        const timer = setTimeout(() => { detach(); reject(new Error(`NO_REPLY:${type}`)); }, 5000);
        const detach = room.onMessage("room/result", (result: Result) => {
            if (result.requestId !== requestId) return;
            clearTimeout(timer);
            detach();
            resolveResult(result);
        });
        room.send(type, { ...body, requestId });
    });
}

async function api(path: string, method = "GET", body?: unknown, token?: string) {
    return fetch(endpoint.replace("ws:", "http:") + "/api/auth" + path, {
        method,
        headers: {
            ...(body === undefined ? {} : { "Content-Type": "application/json" }),
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });
}

async function pair() {
    const host = track(await client(tokens[0]).create("waiting_room", { roomTitle: "테스트 방" }));
    const guest = track(await client(tokens[1]).joinById(host.roomId));
    const room = matchMaker.getLocalRoomById(host.roomId) as WaitingRoom;
    return { host, guest, room };
}

async function readyPair(host: SDKRoom<any, any>, guest: SDKRoom<any, any>) {
    assert.equal((await command(host, "room/ready", { ready: true, characterId: 1 })).ok, true);
    assert.equal((await command(guest, "room/ready", { ready: true, characterId: 2 })).ok, true);
}

describe("인증 HTTP · 실제 MongoDB · 대기방 WebSocket", function () {
    this.timeout(90000);

    before(async function () {
        this.timeout(300000); // 첫 실행의 MongoDB 바이너리 다운로드 포함
        await mkdir(cacheDirectory, { recursive: true });
        dbDirectory = await mkdtemp(resolve(cacheDirectory, "test-mongo-"));
        mongo = await MongoMemoryServer.create({
            binary: { downloadDir: resolve(cacheDirectory, "mongodb"), version: "7.0.24" },
            instance: { ip: "127.0.0.1", dbPath: dbDirectory, storageEngine: "wiredTiger" }
        });
        database = `auth_waiting_${randomUUID().replaceAll("-", "")}`;
        process.env.MONGODB_URI = mongo.getUri();
        process.env.MONGODB_DB = database;
        inspector = await new MongoClient(mongo.getUri()).connect();
        const { default: server } = await import("../src/app.config.js");
        gameServer = server;
        await gameServer.listen(0, "127.0.0.1");
        const address = gameServer.transport.server.address();
        assert.ok(address && typeof address === "object");
        endpoint = `ws://127.0.0.1:${address.port}`;
        for (const loginId of accounts) {
            await authRuntime.service.register({ loginId, password, displayName: loginId });
        }
    });

    beforeEach(async () => {
        tokens = [];
        for (const loginId of accounts.slice(0, 2)) {
            tokens.push((await authRuntime.service.login({ loginId, password })).accessToken);
        }
    });

    afterEach(async () => {
        await Promise.all([...connections].map(room => room.leave().catch((): void => {})));
        connections.clear();
        await Promise.all(matchMaker.disconnectAll());
    });

    after(async () => {
        if (gameServer) await gameServer.gracefullyShutdown(false);
        else await authRuntime.service.stop();
        await inspector?.close();
        if (mongo) await mongo.stop({ doCleanup: false });
        // 이 테스트가 만든 프로젝트 내부 디렉터리만 정리합니다.
        if (dbDirectory && resolve(dbDirectory).startsWith(cacheDirectory + sep)) {
            await rm(dbDirectory, { recursive: true, force: true });
        }
        if (originalUri === undefined) delete process.env.MONGODB_URI;
        else process.env.MONGODB_URI = originalUri;
        if (originalDb === undefined) delete process.env.MONGODB_DB;
        else process.env.MONGODB_DB = originalDb;
    });

    it("가입·로그인·me 응답은 Unity 계약과 일치하고 DB에는 해시만 저장한다", async () => {
        const registration = await api("/register", "POST", {
            loginId: "HTTP_PLAYER", password, displayName: "테스트 사용자"
        });
        assert.equal(registration.status, 201);
        const registered = await registration.json() as any;
        assert.deepEqual(Object.keys(registered.user).sort(), ["accountId", "displayName", "selectedCharacterId"]);
        const document = await inspector.db(database).collection("accounts").findOne({ loginId: "http_player" });
        assert.ok(document);
        assert.equal(document.password, undefined);
        assert.match(document.passwordHash, /^v1:[a-f0-9]{32}:[a-f0-9]{128}$/);
        const response = await api("/login", "POST", { loginId: "http_player", password });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const login = await response.json() as any;
        assert.match(login.accessToken, /^[A-Za-z0-9_-]{43}$/);
        assert.ok(login.expiresAt > Date.now() / 1000 && login.expiresAt < Date.now() / 1000 + 7300);
        const me = await api("/me", "GET", undefined, login.accessToken);
        assert.deepEqual(await me.json(), { user: registered.user });
        const wrong = await api("/login", "POST", { loginId: "http_player", password: password + "wrong" });
        assert.equal(wrong.status, 401);
    });

    it("동시 동일 아이디 가입은 한 계정만 저장한다", async () => {
        const results = await Promise.allSettled([0, 1].map(() => authRuntime.service.register({
            loginId: "duplicate_user", password, displayName: "중복검사"
        })));
        assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
        const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
        assert.equal(rejected.reason.status, 409);
        assert.equal(await inspector.db(database).collection("accounts").countDocuments({ loginId: "duplicate_user" }), 1);
    });

    it("비밀번호 공백은 유지하고 잘못된 입력과 JSON은 거절한다", async () => {
        await authRuntime.service.register({ loginId: "space_password", password: password + " ", displayName: "공백" });
        await assert.rejects(authRuntime.service.login({ loginId: "space_password", password }), (error: AuthError) => error.status === 401);
        await authRuntime.service.login({ loginId: "space_password", password: password + " " });
        const invalid = await api("/register", "POST", { loginId: "../bad", password, displayName: "<b>bad</b>" });
        assert.equal(invalid.status, 400);
        const malformed = await fetch(endpoint.replace("ws:", "http:") + "/api/auth/login", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: "{"
        });
        assert.equal(malformed.status, 400);
        assert.equal((await malformed.json() as any).error, "INVALID_JSON");
    });

    it("인증 없는 방 접속과 제거한 my_room 진입을 거절한다", async () => {
        await assert.rejects(client().joinOrCreate("lobby"));
        await assert.rejects(client().create("waiting_room"));
        await assert.rejects(client(tokens[0]).joinOrCreate("my_room"));
    });

    it("Ready·캐릭터 변경·방장 권한·로딩 장벽·입력 제한을 적용한다", async () => {
        const { host, guest, room } = await pair();
        assert.equal((await command(guest, "room/start")).error, "NOT_HOST");
        assert.equal((await command(host, "room/start")).error, "NOT_ALL_READY");
        host.send("input/move", { x: 0, y: 0, sequence: 1 });
        await readyPair(host, guest);
        assert.equal((await command(guest, "room/character", { characterId: 4 })).ok, true);
        assert.equal(room.state.players.get(guest.sessionId)?.isReady, false);
        assert.equal((await command(host, "room/start")).error, "NOT_ALL_READY");
        await command(guest, "room/ready", { ready: true, characterId: 4 });
        assert.equal((await command(host, "room/start")).ok, true);
        assert.equal(room.state.game.phase, "loading");
        assert.equal(room.state.players.get(host.sessionId)?.lastProcessedInput, 0);
        await command(host, "game/loaded");
        assert.equal(room.state.game.phase, "loading");
        await command(guest, "game/loaded");
        assert.equal(room.state.game.phase, "playing");
        host.send("input/move", { x: 0, y: 0, sequence: 2 });
        await eventually(() => room.state.players.get(host.sessionId)?.lastProcessedInput === 2, "playing 입력 미처리");
        await eventually(() => room.metadata.phase === "playing", "metadata 갱신 실패");
        assert.equal(room.locked, true);
    });

    it("요청 재전송은 이전 결과를 돌려주고 같은 ID의 다른 명령은 거절한다", async () => {
        const { host, guest, room } = await pair();
        await readyPair(host, guest);
        const requestId = randomUUID().replaceAll("-", "");
        const first = await command(host, "room/start", {}, requestId);
        const again = await command(host, "room/start", {}, requestId);
        assert.equal(first.ok, true);
        assert.deepEqual(again, first);
        assert.equal((await command(host, "room/character", { characterId: 4 }, requestId)).error, "REQUEST_ID_REUSED");
        assert.equal(room.state.game.phase, "loading");
    });

    it("실패한 중복 입장의 정리가 기존 계정 점유를 지우지 않는다", async () => {
        const { host, room } = await pair();
        const duplicate = client(tokens[0]);
        await assert.rejects(duplicate.create("waiting_room"));
        await assert.rejects(duplicate.create("waiting_room"));
        assert.ok(room.state.players.has(host.sessionId));
        const id = host.sessionId;
        await host.leave();
        await eventually(() => !room.state.players.has(id), "퇴장 처리 누락");
        track(await duplicate.create("waiting_room"));
    });

    it("4인 정원을 지키고 방장 퇴장 시 권한을 이전한다", async () => {
        const { host, guest, room } = await pair();
        for (const loginId of accounts.slice(2, 4)) {
            const login = await authRuntime.service.login({ loginId, password });
            track(await client(login.accessToken).joinById(host.roomId));
        }
        const extra = await authRuntime.service.login({ loginId: accounts[4], password });
        await assert.rejects(client(extra.accessToken).joinById(host.roomId));
        assert.equal(room.state.players.size, 4);
        await host.leave();
        await eventually(() => room.state.hostSessionId === guest.sessionId, "방장 이전 실패");
    });

    it("로딩 30초 만료 시 미완료자만 내보내고 준비된 참가자로 시작한다", async () => {
        const { host, guest, room } = await pair();
        await readyPair(host, guest);
        await command(host, "room/start");
        await command(host, "game/loaded");
        const leaveCode = closed(guest);
        room.clock.currentTime -= 31000;
        room.clock.tick();
        assert.equal(await leaveCode, 4408);
        await eventually(() => room.state.game.phase === "playing", "로딩 실패자 퇴장 후 진행 실패");
        assert.equal(room.state.players.size, 1);
        assert.ok(room.state.players.has(host.sessionId));
    });

    it("로비 필터·추가 목록·시작 후 metadata가 실제 소켓으로 전파된다", async () => {
        const lobby = track(await client(tokens[0]).joinOrCreate("lobby", { filter: { name: "waiting_room" } }));
        const listings = new Map<string, any>();
        lobby.onMessage("rooms", (rooms: any[]) => { listings.clear(); for (const row of rooms) listings.set(row.roomId, row); });
        lobby.onMessage("+", ([id, row]: [string, any]) => listings.set(id, row));
        lobby.onMessage("-", (id: string) => listings.delete(id));
        lobby.send("filter", { name: "waiting_room" });
        const { host, guest } = await pair();
        await eventually(() => listings.has(host.roomId), "방 생성 목록 미전파");
        assert.equal(listings.get(host.roomId).metadata.title, "테스트 방");
        await readyPair(host, guest);
        await command(host, "room/start");
        await eventually(() => listings.get(host.roomId)?.metadata.phase === "loading", "로비에 loading 미전파");
        await assert.rejects(client(tokens[1]).joinById(host.roomId));
    });

    it("HTTP 로그아웃은 토큰과 이미 연결된 로비·게임방을 함께 폐기한다", async () => {
        const lobby = track(await client(tokens[0]).joinOrCreate("lobby"));
        const game = track(await client(tokens[0]).create("waiting_room"));
        const leftLobby = closed(lobby);
        const leftGame = closed(game);
        assert.equal((await api("/logout", "POST", undefined, tokens[0])).status, 204);
        assert.deepEqual(await Promise.all([leftLobby, leftGame]), [4401, 4401]);
        assert.equal((await api("/me", "GET", undefined, tokens[0])).status, 401);
        assert.equal((await api("/logout", "POST", undefined, tokens[0])).status, 204);
    });

    it("좌석 예약 이후 폐기된 토큰은 실제 소켓 참가 시에도 거절한다", async () => {
        const reservation = await fetch(endpoint.replace("ws:", "http:") + "/matchmake/create/waiting_room", {
            method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tokens[0]}` }, body: "{}"
        });
        assert.equal(reservation.status, 200);
        const seat = await reservation.json() as any;
        authRuntime.service.logout(tokens[0]);
        await assert.rejects(client(tokens[0]).consumeSeatReservation(seat));
    });

    it("재로그인은 이전 토큰과 연결을 폐기한다", async () => {
        const lobby = track(await client(tokens[0]).joinOrCreate("lobby"));
        const left = closed(lobby);
        const fresh = await authRuntime.service.login({ loginId: accounts[0], password });
        assert.equal(await left, 4401);
        assert.throws(() => authRuntime.service.me(tokens[0]), (error: AuthError) => error.status === 401);
        assert.ok(authRuntime.service.me(fresh.accessToken).accountId);
    });

    it("세션 만료는 구독에 전달되고 서비스 재시작 후에도 계정은 유지된다", async () => {
        let now = 1000;
        const first = new AuthService({ nowSeconds: () => now, sessionLifetimeSeconds: 10 });
        const second = new AuthService();
        try {
            await first.start();
            const old = await first.login({ loginId: accounts[0], password });
            let revoked = false;
            first.watch(first.authenticate(old.accessToken), () => { revoked = true; });
            now = 1011;
            assert.throws(() => first.me(old.accessToken), (error: AuthError) => error.status === 401);
            assert.equal(revoked, true);
            const beforeStop = await first.login({ loginId: accounts[0], password });
            await first.stop();
            await second.start();
            assert.throws(() => second.me(beforeStop.accessToken));
            const afterRestart = await second.login({ loginId: accounts[0], password });
            assert.equal(afterRestart.user.accountId, old.user.accountId);
        } finally {
            await first.stop();
            await second.stop();
        }
    });

    it("로그인 요청 제한은 429 JSON과 Retry-After를 반환한다", async () => {
        let response: Response;
        for (let i = 0; i < 12; i++) {
            response = await api("/login", "POST", { loginId: "invalid", password: "x" });
            if (response.status === 429) break;
        }
        assert.equal(response.status, 429);
        assert.ok(Number(response.headers.get("retry-after")) > 0);
        assert.equal((await response.json() as any).error, "RATE_LIMITED");
    });
});
