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
    create(account: AccountDocument): Promise<void>;
    findByLoginId(loginId: string): Promise<AccountDocument | null>;
    findByAccountId(accountId: string): Promise<AccountDocument | null>;
}

export interface SessionStore {
    consumeRegistrationBudget(ip: string): Promise<void>;
    consumeLoginBudget(loginId: string, ip: string): Promise<void>;
    create(accountId: string): Promise<{ accessToken: string; expiresAt: number }>;
    find(accessToken: string): Promise<SessionDocument | null>;
    revoke(accessToken: string): Promise<void>;
    revokeByKey(key: string): Promise<void>;
    findByKey(key: string): Promise<SessionDocument | null>;
    watch(identity: unknown, callback: () => void): Promise<() => void>;
    isCurrent(identity: unknown): boolean;
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

export interface RoomIdentity extends SessionDocument {
    sessionKey: string;
}

export function readObject(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new AuthError(400, "VALIDATION_ERROR", "JSON 객체를 보내세요.");
    }
    return value as Record<string, unknown>;
}

export function requireDisplayName(value: unknown): string {
    if (typeof value !== "string") throw new AuthError(400, "VALIDATION_ERROR", "표시 이름을 입력하세요.");
    const name = value.trim();
    if (name.length < 1 || name.length > 24 || /[<>\u0000-\u001f\u007f]/.test(name)) {
        throw new AuthError(400, "VALIDATION_ERROR", "표시 이름은 제어 문자 없이 1~24자로 입력하세요.");
    }
    return name;
}

export function readRoomIdentity(value: unknown): RoomIdentity {
    if (typeof value !== "object" || value === null) {
        throw new AuthError(401, "INVALID_SESSION", "다시 로그인하세요.");
    }
    const identity = value as Partial<RoomIdentity>;
    if (typeof identity.accountId !== "string" || typeof identity.sessionKey !== "string" ||
        !/^[a-f0-9]{64}$/.test(identity.sessionKey) || !Number.isSafeInteger(identity.expiresAt)) {
        throw new AuthError(401, "INVALID_SESSION", "다시 로그인하세요.");
    }
    return identity as RoomIdentity;
}
