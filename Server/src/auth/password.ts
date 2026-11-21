import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { AuthError } from "./contracts.js";

const HASH_OPTIONS = {
    N: 131072,
    r: 8,
    p: 1,
    maxmem: 256 * 1024 * 1024
};

let activeHashes = 0;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
    if (activeHashes >= 2) {
        throw new AuthError(503, "AUTH_BUSY", "잠시 후 다시 시도하세요.");
    }
    activeHashes++;
    try {
        return await new Promise<Buffer>((resolve, reject) => {
            scrypt(password, salt, 64, HASH_OPTIONS, (error, key) => {
                if (error) reject(error);
                else resolve(key);
            });
        });
    } finally {
        activeHashes--;
    }
}

export async function hashPassword(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt);
    return `v1:${salt.toString("hex")}:${key.toString("hex")}`;
}

// 없는 계정도 같은 해시 연산 경로를 거치게 합니다.
const DUMMY_HASH = `v1:${"00".repeat(16)}:${"00".repeat(64)}`;

export async function verifyPassword(
    password: string,
    stored: string | undefined
): Promise<boolean> {
    const encoded = stored ?? DUMMY_HASH;
    const match = /^v1:([a-f0-9]{32}):([a-f0-9]{128})$/.exec(encoded);
    if (!match) throw new Error("INVALID_STORED_PASSWORD_HASH");

    const actual = await derive(password, Buffer.from(match[1], "hex"));
    const expected = Buffer.from(match[2], "hex");
    const equal = timingSafeEqual(actual, expected);
    return stored !== undefined && equal;
}
