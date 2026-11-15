export interface AccountDocument {
    accountId: string;
    loginId: string;
    passwordHash: string;
    displayName: string;
    selectedCharacterId: number;
    status: "active" | "disabled";
    createdAt: Date;
}

export interface UserProfile {
    accountId: string;
    displayName: string;
    selectedCharacterId: number;
}

export interface LoginResponse {
    accessToken: string;
    expiresAt: number; // Unix seconds.
    user: UserProfile;
}

export interface SessionDocument {
    accountId: string;
    expiresAt: number;
}

export interface AccountStore {
    findByLoginId(loginId: string): Promise<AccountDocument | null>;
    findByAccountId(accountId: string): Promise<AccountDocument | null>;
}

export interface SessionStore {
    consumeLoginBudget(loginId: string, ip: string): Promise<void>;
    create(accountId: string): Promise<{ accessToken: string; expiresAt: number }>;
    find(accessToken: string): Promise<SessionDocument | null>;
    revoke(accessToken: string): Promise<void>;
}

export class AuthError extends Error {
    public constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly retryAfter?: number
    ) {
        super(message);
        this.name = "AuthError";
    }
}

export function normalizeLoginId(value: unknown): string {
    if (typeof value !== "string") {
        throw new AuthError(400, "VALIDATION_ERROR", "아이디를 입력하세요.");
    }
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z0-9_.-]{3,32}$/.test(normalized)) {
        throw new AuthError(400, "VALIDATION_ERROR", "아이디는 영문·숫자·밑줄·점·하이픈으로 3~32자 입력하세요.");
    }
    return normalized;
}

export function requirePassword(value: unknown): string {
    // Passwords must never be trimmed or case-normalized.
    if (typeof value !== "string" || value.length < 8 || value.length > 128) {
        throw new AuthError(400, "VALIDATION_ERROR", "비밀번호는 8~128자 입력하세요.");
    }
    return value;
}

export function requireAccessToken(value: unknown): string {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
        throw new AuthError(401, "INVALID_SESSION", "로그인이 만료되었습니다. 다시 로그인하세요.");
    }
    return value;
}

export function toUserProfile(account: AccountDocument): UserProfile {
    if (
        typeof account.accountId !== "string" || typeof account.displayName !== "string" ||
        !Number.isInteger(account.selectedCharacterId) ||
        account.selectedCharacterId < 1 || account.selectedCharacterId > 4
    ) {
        throw new AuthError(503, "SERVICE_UNAVAILABLE", "계정 정보를 불러올 수 없습니다.");
    }
    return {
        accountId: account.accountId,
        displayName: account.displayName,
        selectedCharacterId: account.selectedCharacterId
    };
}
