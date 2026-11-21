export interface UserProfile {
    accountId: string;
    displayName: string;
    selectedCharacterId: number;
}

// Colyseus의 client.auth에만 보관하는 서버 내부 데이터입니다.
export interface RoomIdentity {
    accountId: string;
    sessionKey: string;
}

export interface LoginResponse {
    accessToken: string;
    expiresAt: number; // Unix 초. 밀리초가 아닙니다.
    user: UserProfile;
}

export class AuthError extends Error {
    public constructor(
        public readonly status: number,
        public readonly code: string,
        message: string
    ) {
        super(message);
        this.name = "AuthError";
    }
}

export function readObject(value: unknown): Record<string, unknown> {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new AuthError(400, "INVALID_BODY", "JSON 객체를 보내세요.");
    }
    return value as Record<string, unknown>;
}

export function readLoginId(value: unknown): string {
    if (typeof value !== "string") {
        throw new AuthError(400, "INVALID_LOGIN_ID", "아이디를 입력하세요.");
    }
    const id = value.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,32}$/.test(id)) {
        throw new AuthError(
            400, "INVALID_LOGIN_ID",
            "아이디는 영문 소문자, 숫자, 밑줄로 3~32자여야 합니다."
        );
    }
    return id;
}

export function readPassword(value: unknown): string {
    if (typeof value !== "string" || value.length < 8 ||
        value.length > 128 || Buffer.byteLength(value, "utf8") > 256) {
        throw new AuthError(
            400, "INVALID_PASSWORD", "비밀번호 길이는 8~128자여야 합니다."
        );
    }
    // 공백도 비밀번호의 일부이므로 trim하지 않습니다.
    return value;
}

export function readDisplayName(value: unknown): string {
    if (typeof value !== "string") {
        throw new AuthError(400, "INVALID_NAME", "닉네임을 입력하세요.");
    }
    const name = value.trim();
    if (name.length < 1 || name.length > 20 ||
        /[<>\u0000-\u001f\u007f]/.test(name)) {
        throw new AuthError(400, "INVALID_NAME", "닉네임 형식을 확인하세요.");
    }
    return name;
}
