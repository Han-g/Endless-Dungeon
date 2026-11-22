import type { OnSessionInvalid } from "./contracts.js";
import { randomUUID } from "node:crypto";
import { MongoServerError } from "mongodb";
import {
    AuthError, normalizeLoginId, requirePassword, requireAccessToken, toUserProfile,
    readObject, requireDisplayName, readRoomIdentity
} from "./contracts.js";
import type { AccountStore, SessionStore, LoginResponse, UserProfile, RoomIdentity } from "./contracts.js";
import { hashPassword, verifyPassword } from "./password.js";
import { tokenDigest } from "./SessionRepository.js";

export class AuthService {
    public constructor(private readonly accounts: AccountStore, private readonly sessions: SessionStore) {}

    public async register(body: unknown, ip: string): Promise<UserProfile> {
        const input = readObject(body);
        const loginId = normalizeLoginId(input.loginId);
        const password = requirePassword(input.password);
        const displayName = requireDisplayName(input.displayName);
        await this.sessions.consumeRegistrationBudget(ip);
        const account = {
            accountId: randomUUID(), loginId, displayName, passwordHash: await hashPassword(password),
            selectedCharacterId: 1, status: "active" as const, createdAt: new Date()
        };
        try { await this.accounts.create(account); }
        catch (error) {
            if (error instanceof MongoServerError && error.code === 11000) {
                throw new AuthError(409, "LOGIN_ID_TAKEN", "이미 사용 중인 아이디입니다.");
            }
            throw error;
        }
        return toUserProfile(account);
    }

    public async login(loginIdInput: unknown, passwordInput: unknown, ip: string): Promise<LoginResponse> {
        const loginId = normalizeLoginId(loginIdInput);
        const password = requirePassword(passwordInput);
        await this.sessions.consumeLoginBudget(loginId, ip);
        const account = await this.accounts.findByLoginId(loginId);
        const validPassword = await verifyPassword(password, account?.passwordHash ?? null);
        if (!account || !validPassword || account.status !== "active") {
            throw new AuthError(401, "INVALID_CREDENTIALS", "아이디 또는 비밀번호가 올바르지 않습니다.");
        }
        const user = toUserProfile(account);
        const session = await this.sessions.create(account.accountId);
        return { ...session, user };
    }

    public async authenticate(tokenInput: unknown): Promise<RoomIdentity> {
        const token = requireAccessToken(tokenInput);
        const session = await this.sessions.find(token);
        if (!session) throw new AuthError(401, "INVALID_SESSION", "다시 로그인하세요.");
        const identity = { ...session, sessionKey: tokenDigest(token) };
        await this.requireIdentity(identity);
        return identity;
    }

    public async requireIdentity(value: unknown): Promise<UserProfile> {
        const identity = readRoomIdentity(value);
        const session = await this.sessions.findByKey(identity.sessionKey);
        if (!session || session.accountId !== identity.accountId || session.expiresAt !== identity.expiresAt) {
            throw new AuthError(401, "INVALID_SESSION", "로그인이 만료되었습니다. 다시 로그인하세요.");
        }
        const account = await this.accounts.findByAccountId(session.accountId);
        if (!account || account.status !== "active") {
            await this.sessions.revokeByKey(identity.sessionKey);
            throw new AuthError(401, "INVALID_SESSION", "사용할 수 없는 계정입니다.");
        }
        return toUserProfile(account);
    }

    public async me(tokenInput: unknown): Promise<UserProfile> {
        const token = requireAccessToken(tokenInput);
        const session = await this.sessions.find(token);
        if (!session) throw new AuthError(401, "INVALID_SESSION", "다시 로그인하세요.");
        return this.requireIdentity({ ...session, sessionKey: tokenDigest(token) });
    }

    public async watch(identity: unknown, onInvalid: OnSessionInvalid): Promise<() => void> {
        await this.requireIdentity(identity);
        return this.sessions.watch(identity, onInvalid);
    }

    public checkSession(identity: unknown) { return this.sessions.checkSession(identity); }
    public async logout(tokenInput: unknown): Promise<void> {
        await this.sessions.revoke(requireAccessToken(tokenInput));
    }
}
