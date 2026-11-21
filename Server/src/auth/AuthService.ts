import { createHash, randomBytes, randomUUID } from "node:crypto";
import { MongoClient, MongoServerError, type Collection } from "mongodb";
import {
    AuthError, readObject, readLoginId, readPassword, readDisplayName,
    type UserProfile, type RoomIdentity, type LoginResponse
} from "./contracts.js";
import { hashPassword, verifyPassword } from "./password.js";

interface AccountDocument {
    _id: string;
    loginId: string;
    displayName: string;
    passwordHash: string;
    selectedCharacterId: number;
    createdAt: Date;
}

interface Session {
    user: UserProfile;
    expiresAt: number;
    watchers: Set<() => void>;
}

interface AuthServiceOptions {
    sessionLifetimeSeconds?: number;
    nowSeconds?: () => number;
}

export class AuthService {
    private mongo?: MongoClient;
    private accounts?: Collection<AccountDocument>;
    private expiryTimer?: ReturnType<typeof setInterval>;
    private readonly sessions = new Map<string, Session>();
    private readonly accountSessions = new Map<string, string>();
    private readonly sessionLifetimeSeconds: number;
    private readonly nowSeconds: () => number;

    public constructor(options: AuthServiceOptions = {}) {
        this.sessionLifetimeSeconds = options.sessionLifetimeSeconds ?? 2 * 60 * 60;
        if (!Number.isInteger(this.sessionLifetimeSeconds) || this.sessionLifetimeSeconds <= 0) {
            throw new Error("INVALID_SESSION_LIFETIME");
        }
        this.nowSeconds = options.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
    }

    public get isReady(): boolean {
        return this.accounts !== undefined;
    }

    public async start(): Promise<void> {
        if (this.accounts) return;
        const uri = process.env.MONGODB_URI;
        if (!uri) throw new Error("MONGODB_URI_REQUIRED");

        const mongo = new MongoClient(uri, {
            serverSelectionTimeoutMS: 5000,
            maxPoolSize: 10
        });
        try {
            await mongo.connect();
            const accounts = mongo
                .db(process.env.MONGODB_DB ?? "endless_dungeon")
                .collection<AccountDocument>("accounts");

            await accounts.createIndex({ loginId: 1 }, { unique: true });
            this.mongo = mongo;
            this.accounts = accounts;
            this.expiryTimer = setInterval(() => this.sweep(), 1000);
            this.expiryTimer.unref();
        } catch (error) {
            await mongo.close();
            throw error;
        }
    }

    public async stop(): Promise<void> {
        if (this.expiryTimer) clearInterval(this.expiryTimer);
        this.expiryTimer = undefined;
        for (const key of [...this.sessions.keys()]) this.revoke(key);
        this.accounts = undefined;
        const mongo = this.mongo;
        this.mongo = undefined;
        await mongo?.close();
    }

    private collection(): Collection<AccountDocument> {
        if (!this.accounts) {
            throw new AuthError(503, "AUTH_NOT_READY", "인증 서버 준비 중입니다.");
        }
        return this.accounts;
    }

    public async register(body: unknown): Promise<UserProfile> {
        const data = readObject(body);
        const loginId = readLoginId(data.loginId);
        const password = readPassword(data.password);
        const displayName = readDisplayName(data.displayName);
        const accounts = this.collection();

        const account: AccountDocument = {
            _id: randomUUID(),
            loginId,
            displayName,
            passwordHash: await hashPassword(password),
            selectedCharacterId: 1,
            createdAt: new Date()
        };
        try {
            await accounts.insertOne(account);
        } catch (error) {
            if (error instanceof MongoServerError && error.code === 11000) {
                throw new AuthError(409, "LOGIN_ID_TAKEN", "이미 사용 중인 아이디입니다.");
            }
            throw error;
        }
        return this.profile(account);
    }

    public async login(body: unknown): Promise<LoginResponse> {
        const data = readObject(body);
        const loginId = readLoginId(data.loginId);
        const password = readPassword(data.password);
        const account = await this.collection().findOne({ loginId });
        const matched = await verifyPassword(password, account?.passwordHash);
        if (!account || !matched) {
            throw new AuthError(401, "INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
        }

        this.sweep();
        const oldKey = this.accountSessions.get(account._id);
        if (!oldKey && this.sessions.size >= 10000) {
            throw new AuthError(503, "SESSION_LIMIT", "잠시 후 다시 시도하세요.");
        }

        const accessToken = randomBytes(32).toString("base64url");
        const key = this.tokenKey(accessToken);
        const user = this.profile(account);
        const expiresAt = this.nowSeconds() + this.sessionLifetimeSeconds;

        // 이 구간은 await 없이 순서대로 실행합니다.
        if (oldKey) this.revoke(oldKey);
        this.sessions.set(key, { user, expiresAt, watchers: new Set() });
        this.accountSessions.set(user.accountId, key);
        return { accessToken, expiresAt, user: { ...user } };
    }

    public authenticate(token: unknown): RoomIdentity {
        const key = this.tokenKey(token);
        const session = this.requireSession(key);
        return { accountId: session.user.accountId, sessionKey: key };
    }

    public me(token: unknown): UserProfile {
        return this.requireIdentity(this.authenticate(token));
    }

    public logout(token: unknown): void {
        // 같은 토큰으로 두 번 호출해도 안전합니다.
        this.revoke(this.tokenKey(token));
    }

    public requireIdentity(value: unknown): UserProfile {
        if (typeof value !== "object" || value === null) throw this.unauthorized();
        const identity = value as Partial<RoomIdentity>;
        if (typeof identity.sessionKey !== "string" ||
            typeof identity.accountId !== "string") throw this.unauthorized();

        const session = this.requireSession(identity.sessionKey);
        if (session.user.accountId !== identity.accountId) throw this.unauthorized();
        return { ...session.user };
    }

    public watch(value: unknown, onInvalid: () => void): () => void {
        // matchmaking 인증 이후 실제 소켓 참가 전까지 만료될 수도 있습니다.
        this.requireIdentity(value);
        const identity = value as RoomIdentity;
        const session = this.requireSession(identity.sessionKey);
        session.watchers.add(onInvalid);
        return () => { session.watchers.delete(onInvalid); };
    }

    private requireSession(key: string): Session {
        const session = this.sessions.get(key);
        if (!session) throw this.unauthorized();
        if (session.expiresAt <= this.nowSeconds()) {
            this.revoke(key);
            throw this.unauthorized();
        }
        return session;
    }

    private tokenKey(token: unknown): string {
        if (typeof token !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
            throw this.unauthorized();
        }
        return createHash("sha256").update(token).digest("hex");
    }

    private revoke(key: string): void {
        const session = this.sessions.get(key);
        if (!session) return;
        this.sessions.delete(key);
        if (this.accountSessions.get(session.user.accountId) === key) {
            this.accountSessions.delete(session.user.accountId);
        }
        const callbacks = [...session.watchers];
        session.watchers.clear();
        for (const callback of callbacks) {
            try { callback(); }
            catch { console.error("[Auth] CONNECTION_CLOSE_FAILED"); }
        }
    }

    private sweep(): void {
        const now = this.nowSeconds();
        for (const [key, session] of this.sessions) {
            if (session.expiresAt <= now) this.revoke(key);
        }
    }

    private profile(account: AccountDocument): UserProfile {
        return {
            accountId: account._id,
            displayName: account.displayName,
            selectedCharacterId: account.selectedCharacterId
        };
    }

    private unauthorized(): AuthError {
        return new AuthError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
    }
}
