import { performance } from "node:perf_hooks";
import { createHash, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import { AuthError, requireAccessToken, readRoomIdentity } from "./contracts.js";
import type { OnSessionInvalid, RoomIdentity, SessionCloseReason, SessionDecision, SessionDocument, SessionStore } from "./contracts.js";

const BUDGET = `
local longest = 0
for i, key in ipairs(KEYS) do
  local count = redis.call('INCR', key)
  if redis.call('TTL', key) < 0 then redis.call('EXPIRE', key, ARGV[1]) end
  if count > tonumber(ARGV[i + 1]) then
    longest = math.max(longest, 1, redis.call('TTL', key))
  end
end
return longest
`;
const CREATE = `
if redis.call('EXISTS', KEYS[1]) == 1 then return 0 end
local old = redis.call('GET', KEYS[2])
redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2])
redis.call('SET', KEYS[2], ARGV[3], 'EX', ARGV[2])
if old and old ~= ARGV[3] then
  redis.call('DEL', ARGV[4] .. old)
  redis.call('PUBLISH', ARGV[5], old)
end
return 1
`;
const CHECK = `
if redis.call('GET', KEYS[1]) == ARGV[1] and redis.call('GET', KEYS[2]) == ARGV[2] then
  return 1
end
return 0
`;
const REVOKE = `
redis.call('DEL', KEYS[1])
if redis.call('GET', KEYS[2]) == ARGV[1] then redis.call('DEL', KEYS[2]) end
redis.call('PUBLISH', ARGV[2], ARGV[1])
return 1
`;

export function tokenDigest(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}
interface WatchedSession {
    identity: RoomIdentity;
    checkedAt: number;
    callbacks: Set<OnSessionInvalid>;
    checking?: Promise<SessionDecision>;
}

export class SessionRepository implements SessionStore {
    private readonly subscriber: Redis;
    private readonly watched = new Map<string, WatchedSession>();
    private timer?: ReturnType<typeof setInterval>;
    private auditing = false;
    private closed = false;

    public constructor(
        private readonly redis: Redis,
        private readonly prefix: string,
        private readonly ttlSeconds: number,
        private readonly now: () => number = () => Math.floor(Date.now() / 1000)
    ) {
        this.subscriber = redis.duplicate({ lazyConnect: true });
        this.subscriber.on("error", () => this.invalidateAll("redis_unavailable"));
        this.subscriber.on("close", () => this.invalidateAll("redis_unavailable"));
        this.redis.on("close", this.onConnectionLost);
        this.subscriber.on("message", (channel, key) => {
            if (channel === this.channel && /^[a-f0-9]{64}$/.test(key)) this.invalidate(key, "session_revoked_or_replaced");
        });
    }

    private get channel(): string { return this.prefix + ":revoked"; }
    private get sessionPrefix(): string { return this.prefix + ":session:"; }
    private accountKey(accountId: string): string { return this.prefix + ":account:" + tokenDigest(accountId); }
    private readonly onConnectionLost = (): void => { this.invalidateAll("redis_unavailable"); };

    public async start(): Promise<void> {
        await this.subscriber.connect();
        await this.subscriber.subscribe(this.channel);
        this.timer = setInterval(() => { void this.audit(); }, 1000);
        this.timer.unref();
    }

    public close(): void {
        this.closed = true;
        if (this.timer) clearInterval(this.timer);
        this.invalidateAll("auth_shutdown");
        this.redis.off("close", this.onConnectionLost);
        this.subscriber.disconnect();
    }

    public async consumeLoginBudget(loginId: string, ip: string): Promise<void> {
        await this.budget(
            [this.prefix + ":limit:ip:" + tokenDigest(ip), this.prefix + ":limit:login:" + tokenDigest(loginId)],
            [20, 5]
        );
    }

    public async consumeRegistrationBudget(ip: string): Promise<void> {
        await this.budget([this.prefix + ":limit:register:" + tokenDigest(ip)], [5]);
    }

    private async budget(keys: string[], limits: number[]): Promise<void> {
        const wait = Number(await this.redis.eval(BUDGET, keys.length, ...keys, 60, ...limits));
        if (wait > 0) throw new AuthError(429, "RATE_LIMITED", "요청이 많습니다. 잠시 후 다시 시도하세요.", wait);
    }

    public async create(accountId: string): Promise<{ accessToken: string; expiresAt: number }> {
        const accessToken = randomBytes(32).toString("base64url");
        const key = tokenDigest(accessToken);
        const expiresAt = this.now() + this.ttlSeconds;
        const document: SessionDocument = { accountId, expiresAt };
        const result = await this.redis.eval(
            CREATE, 2, this.sessionPrefix + key, this.accountKey(accountId),
            JSON.stringify(document), this.ttlSeconds, key, this.sessionPrefix, this.channel
        );
        if (Number(result) !== 1) throw new AuthError(503, "SERVICE_UNAVAILABLE", "세션을 만들 수 없습니다.");
        // 같은 프로세스의 이전 연결은 Pub/Sub 수신을 기다리지 않고 폐기합니다.
        for (const [oldKey, entry] of this.watched) {
            if (entry.identity.accountId === accountId && oldKey !== key) this.invalidate(oldKey, "session_replaced");
        }
        return { accessToken, expiresAt };
    }

    public async find(accessToken: string): Promise<SessionDocument | null> {
        return this.findByKey(tokenDigest(requireAccessToken(accessToken)));
    }

    public async findByKey(key: string): Promise<SessionDocument | null> {
        if (!/^[a-f0-9]{64}$/.test(key)) return null;
        const raw = await this.redis.get(this.sessionPrefix + key);
        if (raw === null) return null;
        let value: Partial<SessionDocument> | null;
        try { value = JSON.parse(raw); } catch { return null; }
        if (!value || typeof value.accountId !== "string" ||
            !Number.isSafeInteger(value.expiresAt) || value.expiresAt! <= this.now()) return null;
        // 조회 중 새 로그인이 발생해도 이전 세션을 승인하지 않도록 원자적으로 재검사합니다.
        const current = await this.redis.eval(
            CHECK, 2, this.sessionPrefix + key, this.accountKey(value.accountId), raw, key
        );
        return Number(current) === 1 ? value as SessionDocument : null;
    }

    public async revoke(accessToken: string): Promise<void> {
        await this.revokeByKey(tokenDigest(requireAccessToken(accessToken)));
    }

    public async revokeByKey(key: string): Promise<void> {
        if (!/^[a-f0-9]{64}$/.test(key)) throw new AuthError(401, "INVALID_SESSION", "다시 로그인하세요.");
        const raw = await this.redis.get(this.sessionPrefix + key);
        let accountId: string | undefined;
        try { accountId = raw ? JSON.parse(raw)?.accountId : undefined; } catch { /* corrupt session */ }
        if (typeof accountId === "string") {
            await this.redis.eval(REVOKE, 2, this.sessionPrefix + key, this.accountKey(accountId), key, this.channel);
        } else {
            await this.redis.del(this.sessionPrefix + key);
            await this.redis.publish(this.channel, key);
        }
        this.invalidate(key, "session_revoked");
    }

    public async watch(value: unknown, callback: OnSessionInvalid): Promise<() => void> {
        const identity = readRoomIdentity(value);
        if (this.closed || this.redis.status !== "ready" || this.subscriber.status !== "ready") {
            throw new AuthError(503, "SERVICE_UNAVAILABLE", "인증 연결을 확인하세요.");
        }
        let entry = this.watched.get(identity.sessionKey);
        if (!entry) {
            entry = { identity, checkedAt: 0, callbacks: new Set() };
            this.watched.set(identity.sessionKey, entry);
        }
        entry.callbacks.add(callback);
        const detach = (): void => {
            entry.callbacks.delete(callback);
            if (entry.callbacks.size === 0 && this.watched.get(identity.sessionKey) === entry) {
                this.watched.delete(identity.sessionKey);
            }
        };
        try {
            const session = await this.findByKey(identity.sessionKey);
            if (!session || session.accountId !== identity.accountId || session.expiresAt !== identity.expiresAt ||
                this.watched.get(identity.sessionKey) !== entry) {
                throw new AuthError(401, "INVALID_SESSION", "다시 로그인하세요.");
            }
            entry.checkedAt = performance.now();
            return detach;
        } catch (error) {
            detach();
            throw error;
        }
    }

    public checkSession(value: unknown): SessionDecision | Promise<SessionDecision> {
        let identity: RoomIdentity;
        try { identity = readRoomIdentity(value); }
        catch { return "invalid_identity"; }
        if (this.closed) return "auth_shutdown";
        if (identity.expiresAt <= this.now()) return "session_expired";
        if (this.redis.status !== "ready" || this.subscriber.status !== "ready") return "redis_unavailable";
        const entry = this.watched.get(identity.sessionKey);
        if (!entry) return "watch_removed";
        if (identity.accountId !== entry.identity.accountId || identity.expiresAt !== entry.identity.expiresAt) {
            return "invalid_identity";
        }
        if (performance.now() - entry.checkedAt <= 2500) return "current";
        return this.refresh(identity.sessionKey, entry);
    }

    private refresh(key: string, entry: WatchedSession): Promise<SessionDecision> {
        // The periodic audit and concurrent inputs share one Redis validation.
        if (!entry.checking) {
            entry.checking = this.verify(key, entry).finally(() => { entry.checking = undefined; });
        }
        return entry.checking;
    }

    private async verify(key: string, entry: WatchedSession): Promise<SessionDecision> {
        let reason: SessionCloseReason;
        try {
            const session = await this.findByKey(key);
            if (this.watched.get(key) !== entry) return "watch_removed";
            if (entry.identity.expiresAt <= this.now()) reason = "session_expired";
            else if (session?.accountId !== entry.identity.accountId || session.expiresAt !== entry.identity.expiresAt) {
                reason = "session_missing_or_changed";
            } else {
                entry.checkedAt = performance.now();
                return "current";
            }
        } catch { reason = "redis_unavailable"; }
        if (this.watched.get(key) === entry) this.invalidate(key, reason);
        return reason;
    }

    private async audit(): Promise<void> {
        if (this.closed || this.auditing) return;
        this.auditing = true;
        try {
            await Promise.all([...this.watched].map(([key, entry]) => this.refresh(key, entry)));
        } finally { this.auditing = false; }
    }

    private invalidate(key: string, reason: SessionCloseReason): void {
        const entry = this.watched.get(key);
        if (!entry) return;
        this.watched.delete(key);
        for (const callback of entry.callbacks) {
            try { callback(reason); } catch { console.error("[Auth] CONNECTION_CLOSE_FAILED"); }
        }
        entry.callbacks.clear();
    }

    private invalidateAll(reason: SessionCloseReason): void {
        for (const key of [...this.watched.keys()]) this.invalidate(key, reason);
    }
}
