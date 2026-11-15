import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { AuthError, requirePassword } from "./contracts.js";

// Fixed parameters prevent stored hashes from requesting unbounded resources.
const KEY_LENGTH = 32;
const PREFIX = "scrypt:v1:32768:8:3";
const HASH_PATTERN = /^scrypt:v1:32768:8:3:([a-f0-9]{32}):([a-f0-9]{64})$/;
const DUMMY_HASH = PREFIX + ":" + "00".repeat(16) + ":" + "00".repeat(KEY_LENGTH);
let activeDerivations = 0;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
    if (activeDerivations >= 2) {
        throw new AuthError(429, "RATE_LIMITED", "잠시 후 다시 로그인하세요.", 1);
    }
    activeDerivations++;
    try {
        return await new Promise<Buffer>((resolve, reject) => {
            scrypt(password, salt, KEY_LENGTH, {
                N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024
            }, (error, result) => error ? reject(error) : resolve(result));
        });
    } finally {
        activeDerivations--;
    }
}

export async function hashPassword(password: string): Promise<string> {
    requirePassword(password);
    const salt = randomBytes(16);
    const digest = await derive(password, salt);
    return PREFIX + ":" + salt.toString("hex") + ":" + digest.toString("hex");
}

export async function verifyPassword(password: string, storedHash: string | null): Promise<boolean> {
    const parsed = typeof storedHash === "string" ? HASH_PATTERN.exec(storedHash) : null;
    // Unknown accounts and malformed hashes still perform the same expensive work.
    const parts = parsed ?? HASH_PATTERN.exec(DUMMY_HASH)!;
    const actual = await derive(password, Buffer.from(parts[1], "hex"));
    const equal = timingSafeEqual(actual, Buffer.from(parts[2], "hex"));
    return parsed !== null && equal;
}
