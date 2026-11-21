import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { Redis } from "ioredis";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { MongoClient } from "mongodb";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import { Client, type Room as SDKRoom } from "@colyseus/sdk";
import { matchMaker, type Server } from "colyseus";
import { AuthRuntime } from "../src/auth/runtime.js";
import { tokenDigest } from "../src/auth/SessionRepository.js";
import { AuthError } from "../src/auth/contracts.js";
import { authRuntime } from "../src/auth/runtime.js";
import type { WaitingRoom } from "../src/rooms/WaitingRoom.js";
import { EnemyState } from "../src/rooms/schema/EnemyState.js";
import { GAINS_PER_LEVEL, LEVEL_XP, XP_PER_KILL } from "../src/game/CharacterGrowth.js";
import { CHARACTER_DEFINITIONS } from "../src/game/CharacterCatalog.js";

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
let redis: Redis;
let redisProcess: ChildProcess;
let keyPrefix: string;
const envKeys = ["MONGODB_URI", "MONGODB_DATABASE", "REDIS_URL", "AUTH_KEY_PREFIX", "AUTH_SESSION_TTL_SECONDS"];
const originalEnvironment = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));

async function unusedPort(): Promise<number> {
    const listener = createServer();
    await new Promise<void>((resolveListen, reject) => {
        listener.once("error", reject);
        listener.listen(0, "127.0.0.1", resolveListen);
    });
    const address = listener.address();
    assert.ok(address && typeof address === "object");
    await new Promise<void>((resolveClose, reject) => listener.close(error => error ? reject(error) : resolveClose()));
    return address.port;
}

async function login(loginId: string, inputPassword = password) {
    return authRuntime.service.login(loginId, inputPassword, "fixture-client");
}


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

describe("WSL 인증 HTTP · 실제 MongoDB/Redis · 대기방 WebSocket", function () {
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
        process.env.MONGODB_DATABASE = database;
        keyPrefix = "ed:test:" + randomUUID().replaceAll("-", "");
        process.env.AUTH_KEY_PREFIX = keyPrefix;
        process.env.AUTH_SESSION_TTL_SECONDS = "1800";
        const redisPort = await unusedPort();
        assert.notEqual(redisPort, 6379);
        redisProcess = spawn("redis-server", [
            "--bind", "127.0.0.1", "--port", String(redisPort), "--save", "",
            "--appendonly", "no", "--dir", dbDirectory
        ], { stdio: ["ignore", "pipe", "pipe"] });
        redisProcess.stdout?.resume();
        redisProcess.stderr?.resume();
        process.env.REDIS_URL = "redis://127.0.0.1:" + redisPort;
        redis = new Redis(process.env.REDIS_URL, { retryStrategy: count => count > 30 ? null : 100 });
        redis.on("error", () => {});
        await eventually(() => redis.status === "ready", "격리 Redis 시작 실패");

        inspector = await new MongoClient(mongo.getUri()).connect();
        const { default: server } = await import("../src/app.config.js");
        gameServer = server;
        await gameServer.listen(0, "127.0.0.1");
        const address = gameServer.transport.server.address();
        assert.ok(address && typeof address === "object");
        endpoint = `ws://127.0.0.1:${address.port}`;
        // 통합 전 WSL의 accountId/status 필드와 기존 해시로 만든 고정 호환성 fixture.
        await inspector.db(database).collection("accounts").insertOne({
            accountId: "legacy-account-id", loginId: accounts[0], displayName: "기존 계정",
            passwordHash: "scrypt:v1:32768:8:3:000102030405060708090a0b0c0d0e0f:3c76c8d0e32cee86eca7e438fe8bffb7e69674eb1e0a31de4625295cccd4a3c4",
            selectedCharacterId: 3, status: "active", createdAt: new Date("2025-01-01T00:00:00Z")
        });
        for (const loginId of accounts.slice(1)) {
            await authRuntime.service.register({ loginId, password, displayName: loginId }, "fixtures");
        }
    });

    beforeEach(async () => {
        const limits = await redis.keys(keyPrefix + ":limit:*");
        if (limits.length) await redis.del(...limits);
        tokens = [];
        for (const loginId of accounts.slice(0, 2)) {
            tokens.push((await login(loginId)).accessToken);
        }
    });

    afterEach(async () => {
        await Promise.all([...connections].map(room => room.leave().catch((): void => {})));
        connections.clear();
        await Promise.all(matchMaker.disconnectAll());
    });

    after(async () => {
        if (gameServer) await gameServer.gracefullyShutdown(false);
        else await authRuntime.close();
        await inspector?.close();
        redis?.disconnect();
        if (redisProcess && redisProcess.exitCode === null) {
            const exited = new Promise<void>(resolveExit => redisProcess.once("exit", () => resolveExit()));
            redisProcess.kill("SIGTERM");
            await exited;
        }
        if (mongo) await mongo.stop({ doCleanup: false });
        // 이 테스트가 만든 프로젝트 내부 디렉터리만 정리합니다.
        if (dbDirectory && resolve(dbDirectory).startsWith(cacheDirectory + sep)) {
            await rm(dbDirectory, { recursive: true, force: true });
        }
        for (const key of envKeys) {
            if (originalEnvironment[key] === undefined) delete process.env[key];
            else process.env[key] = originalEnvironment[key];
        }
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
        assert.match(document.passwordHash, /^scrypt:v1:32768:8:3:[a-f0-9]{32}:[a-f0-9]{64}$/);
        const response = await api("/login", "POST", { loginId: "http_player", password });
        assert.equal(response.status, 200);
        assert.equal(response.headers.get("cache-control"), "no-store");
        const login = await response.json() as any;
        assert.match(login.accessToken, /^[A-Za-z0-9_-]{43}$/);
        assert.ok(login.expiresAt > Date.now() / 1000 && login.expiresAt < Date.now() / 1000 + 1900);
        const me = await api("/me", "GET", undefined, login.accessToken);
        assert.deepEqual(await me.json(), { user: registered.user });
        const wrong = await api("/login", "POST", { loginId: "http_player", password: password + "wrong" });
        assert.equal(wrong.status, 401);
    });

    it("동시 동일 아이디 가입은 한 계정만 저장한다", async () => {
        const results = await Promise.allSettled([0, 1].map(() => authRuntime.service.register({
            loginId: "duplicate_user", password, displayName: "중복검사"
        }, "duplicate-fixture")));
        assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
        const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
        assert.equal(rejected.reason.status, 409);
        assert.equal(await inspector.db(database).collection("accounts").countDocuments({ loginId: "duplicate_user" }), 1);
    });

    it("비밀번호 공백은 유지하고 잘못된 입력과 JSON은 거절한다", async () => {
        await authRuntime.service.register({ loginId: "space_password", password: password + " ", displayName: "공백" }, "space-fixture");
        await assert.rejects(login("space_password"), (error: AuthError) => error.status === 401);
        await login("space_password", password + " ");
        const invalid = await api("/register", "POST", { loginId: "../bad", password, displayName: "<b>bad</b>" });
        assert.equal(invalid.status, 400);
        const malformed = await fetch(endpoint.replace("ws:", "http:") + "/api/auth/login", {
            method: "POST", headers: { "Content-Type": "application/json" }, body: "{"
        });
        assert.equal(malformed.status, 400);
        assert.equal((await malformed.json() as any).error, "VALIDATION_ERROR");
    });

    it("인증 없는 방 접속과 제거한 my_room 진입을 거절한다", async () => {
        await assert.rejects(client().joinOrCreate("lobby"));
        await assert.rejects(client().create("waiting_room"));
        await assert.rejects(client(tokens[0]).joinOrCreate("my_room"));
    });

    it("기본 능력치 목록과 입장·캐릭터 선택 결과를 실제 소켓으로 전송한다", async () => {
        const { host, guest, room } = await pair();
        await eventually(() => host.state?.characterCatalog?.size === 4 &&
            host.state?.players?.get(host.sessionId)?.characterId === 3,
            "초기 능력치 상태 미수신");
        const close = (actual: number, expected: number) => {
            assert.ok(Math.abs(actual - expected) < 0.00001, `${actual} != ${expected}`);
        };
        const initial = host.state.players.get(host.sessionId);
        assert.equal(initial.hp, 120);
        assert.equal(initial.maxHp, 120);
        close(initial.moveSpeed, 6);
        for (const definition of CHARACTER_DEFINITIONS) {
            const stats = host.state.characterCatalog.get(String(definition.id));
            assert.equal(stats.maxHp, definition.maxHp);
            close(stats.moveSpeed, definition.moveSpeed);
            assert.equal(stats.damage, definition.weapon.damage);
            close(stats.attacksPerSecond, definition.weapon.attacksPerSecond);
            close(stats.projectileSpeed, definition.weapon.speed);
            close(stats.range, definition.weapon.range);
            assert.equal(stats.maxHitCount, definition.weapon.maxHitCount);
            assert.equal(stats.projectileTypeId, definition.weapon.projectileTypeId);
        }
        // 클라이언트가 보낸 수치를 무시하고 서버가 캐릭터 ID로 능력치를 결정합니다.
        assert.equal((await command(guest, "room/ready", {
            ready: true, characterId: 1, hp: 99999, moveSpeed: 99999
        })).ok, true);
        await eventually(() => host.state.players.get(guest.sessionId)?.isReady === true,
            "준비 후 능력치 미수신");
        const remote = host.state.players.get(guest.sessionId);
        assert.equal(remote.hp, 150);
        assert.equal(remote.maxHp, 150);
        close(remote.moveSpeed, 3.5);
        assert.equal((await command(guest, "room/character", { characterId: 4 })).ok, true);
        await eventually(() => host.state.players.get(guest.sessionId)?.characterId === 4,
            "변경된 능력치 미수신");
        assert.equal(remote.hp, 100);
        close(remote.moveSpeed, 3.6);
        assert.equal(remote.isReady, false);
        assert.equal(room.state.players.get(guest.sessionId)?.maxHp, 100);
    });

    it("실제 투사체 처치 시 마지막 타격자의 성장 상태만 소켓으로 전파한다", async () => {
        const { host, guest, room } = await pair();
        await readyPair(host, guest);
        await command(host, "room/start");
        await command(host, "game/loaded");
        const shooter = room.state.players.get(host.sessionId)!;
        const weapon = CHARACTER_DEFINITIONS.find(d => d.id === shooter.characterId)!.weapon;
        const gain = GAINS_PER_LEVEL[shooter.characterId];
        const startXp = Math.max(0, LEVEL_XP[1] - XP_PER_KILL);
        shooter.experience = startXp;
        room.state.game.killCount = 9;
        const startKills = shooter.killCount;
        const maxHp = shooter.maxHp;
        const enemy = new EnemyState();
        enemy.x = shooter.x + weapon.spawnDistance;
        enemy.y = shooter.y + weapon.originOffsetY;
        room.state.enemies.set("growth-target", enemy);
        await command(guest, "game/loaded");
        host.send("input/attack", { aimX: 1, aimY: 0 });
        await eventually(() => guest.state?.players?.get(host.sessionId)?.level === 2,
            "처치자의 레벨업 미수신");
        const result = guest.state.players.get(host.sessionId);
        assert.equal(result.experience, startXp + XP_PER_KILL);
        assert.equal(result.nextLevelExperience, LEVEL_XP[2]);
        assert.equal(result.killCount, startKills + 1);
        assert.equal(result.maxHp, maxHp + gain.maxHp);
        assert.equal(result.damage, weapon.damage + gain.damage);
        assert.ok(Math.abs(result.attacksPerSecond - (weapon.attacksPerSecond + gain.attacksPerSecond)) < 0.00001);
        assert.equal(guest.state.game.killCount, 10);
        await eventually(() => host.state.players.get(host.sessionId)?.traitDeadline > 0 &&
            guest.state.players.get(guest.sessionId)?.traitDeadline > 0, "team choices not received");
        assert.equal(guest.state.traitCatalog.length, 3);
        assert.equal(guest.state.nextTraitKills, 25);
        const offerId = guest.state.players.get(guest.sessionId).traitOfferId;
        guest.send("trait/choose", { offerId, traitId: "kill_heal", sessionId: host.sessionId });
        guest.send("trait/choose", { offerId, traitId: "kill_heal" });
        host.send("trait/choose", { offerId, traitId: "hurt_grace" });
        await eventually(() => guest.state.players.get(host.sessionId)?.lastTraitId === "hurt_grace" &&
            guest.state.players.get(guest.sessionId)?.lastTraitId === "kill_heal", "trait picks not synchronized");
        assert.equal(guest.state.players.get(guest.sessionId).traitRanks.get("kill_heal"), 1);
        assert.equal(guest.state.players.get(host.sessionId).traitRanks.has("kill_heal"), false);
        assert.equal(guest.state.players.get(guest.sessionId).experience, 0);
        assert.equal(guest.state.enemies.has("growth-target"), false);
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
            const result = await login(loginId);
            track(await client(result.accessToken).joinById(host.roomId));
        }
        const extra = await login(accounts[4]);
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
        await authRuntime.service.logout(tokens[0]);
        await assert.rejects(client(tokens[0]).consumeSeatReservation(seat));
    });

    it("재로그인은 이전 토큰과 연결을 폐기한다", async () => {
        const lobby = track(await client(tokens[0]).joinOrCreate("lobby"));
        const left = closed(lobby);
        const fresh = await login(accounts[0]);
        assert.equal(await left, 4401);
        await assert.rejects(authRuntime.service.me(tokens[0]), (error: AuthError) => error.status === 401);
        assert.ok((await authRuntime.service.me(fresh.accessToken)).accountId);
    });

    it("통합 전 형식의 기존 계정으로 로그인하며 해시와 프로필을 바꾸지 않는다", async () => {
        const before = await inspector.db(database).collection("accounts").findOne({ loginId: accounts[0] });
        const result = await login(accounts[0]);
        assert.equal(result.user.accountId, "legacy-account-id");
        assert.equal(result.user.selectedCharacterId, 3);
        assert.equal(result.user.displayName, "기존 계정");
        assert.deepEqual(await inspector.db(database).collection("accounts").findOne({ loginId: accounts[0] }), before);
    });

    it("기존 토큰 로그아웃이 새 로그인 세션을 삭제하지 않는다", async () => {
        const fresh = await login(accounts[0]);
        await authRuntime.service.logout(tokens[0]);
        assert.equal((await authRuntime.service.me(fresh.accessToken)).accountId, "legacy-account-id");
    });

    it("서로 다른 인증 인스턴스의 로그인·로그아웃이 Pub/Sub으로 기존 소켓을 종료한다", async () => {
        const other = new AuthRuntime();
        try {
            await other.initialize();
            const lobby = track(await client(tokens[0]).joinOrCreate("lobby"));
            const left = closed(lobby);
            const fresh = await other.service.login(accounts[0], password, "other-instance");
            assert.equal(await left, 4401);
            const next = track(await client(fresh.accessToken).joinOrCreate("lobby"));
            const nextLeft = closed(next);
            await other.service.logout(fresh.accessToken);
            assert.equal(await nextLeft, 4401);
        } finally { await other.close(); }
    });

    it("Pub/Sub 없이 Redis 세션이 만료돼도 주기 검사로 기존 소켓을 종료한다", async () => {
        const lobby = track(await client(tokens[0]).joinOrCreate("lobby"));
        const left = closed(lobby);
        await redis.pexpire(keyPrefix + ":session:" + tokenDigest(tokens[0]), 1);
        assert.equal(await left, 4401);
        await assert.rejects(authRuntime.service.me(tokens[0]), (error: AuthError) => error.status === 401);
    });

    it("인증 런타임 재시작 후 Redis 세션과 MongoDB 계정을 유지한다", async () => {
        const first = new AuthRuntime();
        const second = new AuthRuntime();
        try {
            await first.initialize();
            const beforeStop = await first.service.login(accounts[0], password, "restart-test");
            await first.close();
            await second.initialize();
            assert.deepEqual(await second.service.me(beforeStop.accessToken), beforeStop.user);
        } finally {
            await first.close();
            await second.close();
        }
    });

    it("동시 로그인은 Redis에서 마지막으로 발급한 세션 하나만 유효하다", async () => {
        const results = await Promise.all([login(accounts[0]), login(accounts[0])]);
        const verified = await Promise.allSettled(results.map(value => authRuntime.service.me(value.accessToken)));
        assert.equal(verified.filter(value => value.status === "fulfilled").length, 1);
    });

    it("로그인 요청 제한은 429 JSON과 Retry-After를 반환한다", async () => {
        let response: Response;
        for (let i = 0; i < 7; i++) {
            response = await api("/login", "POST", { loginId: "missing_account", password });
            if (response.status === 429) break;
        }
        assert.equal(response.status, 429);
        assert.ok(Number(response.headers.get("retry-after")) > 0);
        assert.equal((await response.json() as any).error, "RATE_LIMITED");
    });

    it("비활성 계정 조회는 세션을 폐기하고 기존 연결을 종료한다", async () => {
        const lobby = track(await client(tokens[1]).joinOrCreate("lobby"));
        const left = closed(lobby);
        const collection = inspector.db(database).collection("accounts");
        await collection.updateOne({ loginId: accounts[1] }, { $set: { status: "disabled" } });
        try {
            assert.equal((await api("/me", "GET", undefined, tokens[1])).status, 401);
            assert.equal(await left, 4401);
            assert.equal(await redis.get(keyPrefix + ":session:" + tokenDigest(tokens[1])), null);
        } finally {
            await collection.updateOne({ loginId: accounts[1] }, { $set: { status: "active" } });
        }
    });

    it("production 진입점은 저장소 준비 후 접속을 받고 개발 도구를 노출하지 않는다", async () => {
        const port = await unusedPort();
        let output = "";
        const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
            cwd: process.cwd(),
            env: { ...process.env, NODE_ENV: "production", PORT: String(port), AUTH_KEY_PREFIX: keyPrefix + ":entry" },
            stdio: ["ignore", "pipe", "pipe"]
        });
        child.stdout?.on("data", chunk => { output += chunk.toString(); });
        child.stderr?.on("data", chunk => { output += chunk.toString(); });
        try {
            const until = Date.now() + 10000;
            let ready = false;
            while (!ready && Date.now() < until) {
                try { ready = (await fetch("http://127.0.0.1:" + port + "/health")).status === 200; }
                catch { /* listener is not ready yet */ }
                if (!ready) await delay(50);
            }
            assert.ok(ready, "production startup failed: " + output);
            assert.equal((await fetch("http://127.0.0.1:" + port + "/monitor")).status, 404);
            assert.equal((await fetch("http://127.0.0.1:" + port + "/rooms")).status, 404);
            assert.equal((await fetch("http://127.0.0.1:" + port + "/__apidocs")).status, 404);
        } finally {
            if (child.exitCode === null && child.signalCode === null) {
                const exited = new Promise<void>(resolveExit => child.once("exit", () => resolveExit()));
                child.kill("SIGTERM");
                const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
                await exited;
                clearTimeout(timer);
            }
        }
    });

    it("Redis 연결 장애 시 열린 소켓을 닫고 인증 요청을 거절한다", async () => {
        const lobby = track(await client(tokens[0]).joinOrCreate("lobby"));
        const left = closed(lobby);
        redisProcess.kill("SIGTERM");
        assert.equal(await left, 4401);
        assert.equal((await api("/me", "GET", undefined, tokens[0])).status, 503);
    });
});
