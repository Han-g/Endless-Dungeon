import { AuthError, normalizeLoginId, requirePassword, requireAccessToken, toUserProfile } from "./contracts.js";
import type { AccountStore, SessionStore, LoginResponse, UserProfile } from "./contracts.js";
import { verifyPassword } from "./password.js";

export class AuthService {
    public constructor(private readonly accounts: AccountStore, private readonly sessions: SessionStore) {}

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

    public async me(tokenInput: unknown): Promise<UserProfile> {
        const accessToken = requireAccessToken(tokenInput);
        const session = await this.sessions.find(accessToken);
        if (!session) {
            throw new AuthError(401, "INVALID_SESSION", "로그인이 만료되었습니다. 다시 로그인하세요.");
        }
        const account = await this.accounts.findByAccountId(session.accountId);
        if (!account || account.status !== "active") {
            await this.sessions.revoke(accessToken);
            throw new AuthError(401, "INVALID_SESSION", "사용할 수 없는 계정입니다.");
        }
        return toUserProfile(account);
    }

    public async logout(tokenInput: unknown): Promise<void> {
        await this.sessions.revoke(requireAccessToken(tokenInput));
    }
}
