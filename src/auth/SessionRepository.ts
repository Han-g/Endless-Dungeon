import { createHash, randomBytes } from "node:crypto";
import type { Redis } from "ioredis";
import { AuthError, requireAccessToken } from "./contracts.js";
import type { SessionDocument, SessionStore } from "./contracts.js";

const LOGIN_LIMIT_SCRIPT = [
    "local longest = 0",
    "for i, key in ipairs(KEYS) do",
    "  local count = redis.call('INCR', key)",
    "  if redis.call('TTL', key) < 0 then redis.call('EXPIRE', key, ARGV[1]) end",
    "  if count > tonumber(ARGV[i + 1]) then",
    "    longest = math.max(longest, 1, redis.call('TTL', key))",
    "  end",
    "end",
    "return longest"
].join("\n");

function digest(value: string): string {
    return createHash("sha256").update(value).digest("hex");
}

export class SessionRepository implements SessionStore {
    public constructor(
        private readonly redis: Redis,
        private readonly prefix: string,
        private readonly ttlSeconds: number,
        private readonly now: () => number = () => Math.floor(Date.now() / 1000)
    ) {}

    private key(token: string): string {
        return this.prefix + ":session:" + digest(requireAccessToken(token));
    }

    public async consumeLoginBudget(loginId: string, ip: string): Promise<void> {
        const wait = Number(await this.redis.eval(
            LOGIN_LIMIT_SCRIPT, 2,
            this.prefix + ":limit:ip:" + digest(ip),
            this.prefix + ":limit:login:" + digest(loginId),
            60, 20, 5
        ));
        if (wait > 0) {
            throw new AuthError(429, "RATE_LIMITED", "로그인 시도가 많습니다. 잠시 후 다시 시도하세요.", wait);
        }
    }

    public async create(accountId: string): Promise<{ accessToken: string; expiresAt: number }> {
        const accessToken = randomBytes(32).toString("base64url");
        const expiresAt = this.now() + this.ttlSeconds;
        const document: SessionDocument = { accountId, expiresAt };
        const result = await this.redis.set(
            this.key(accessToken), JSON.stringify(document), "EX", this.ttlSeconds, "NX"
        );
        if (result !== "OK") {
            throw new AuthError(503, "SERVICE_UNAVAILABLE", "로그인 세션을 만들 수 없습니다.");
        }
        return { accessToken, expiresAt };
    }

    public async find(accessToken: string): Promise<SessionDocument | null> {
        const key = this.key(accessToken);
        const raw = await this.redis.get(key);
        if (raw === null) return null;
        let parsed: unknown;
        try { parsed = JSON.parse(raw); }
        catch {
            await this.redis.del(key);
            return null;
        }
        const candidate = parsed as Partial<SessionDocument> | null;
        if (
            !candidate || typeof candidate.accountId !== "string" ||
            !Number.isSafeInteger(candidate.expiresAt) || candidate.expiresAt! <= this.now()
        ) {
            await this.redis.del(key);
            return null;
        }
        return candidate as SessionDocument;
    }

    public async revoke(accessToken: string): Promise<void> {
        // Each login has its own token; an old logout cannot delete a new login.
        await this.redis.del(this.key(accessToken));
    }
}
