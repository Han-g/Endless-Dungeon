export interface AuthConfig {
    mongodbUri: string;
    mongodbDatabase: string;
    redisUrl: string;
    keyPrefix: string;
    sessionTtlSeconds: number;
}

export function readAuthConfig(): AuthConfig {
    const mongodbUri = process.env.MONGODB_URI;
    const redisUrl = process.env.REDIS_URL;
    const mongodbDatabase = process.env.MONGODB_DATABASE ?? "endless_dungeon";
    const keyPrefix = process.env.AUTH_KEY_PREFIX ?? "ed:development:auth";
    const sessionTtlSeconds = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? "1800");
    if (!mongodbUri || !/^mongodb(\+srv)?:\/\//.test(mongodbUri)) throw new Error("MONGODB_URI is required.");
    if (!redisUrl || !/^rediss?:\/\//.test(redisUrl)) throw new Error("REDIS_URL is required.");
    if (!/^[a-zA-Z0-9_-]{1,64}$/.test(mongodbDatabase)) throw new Error("MONGODB_DATABASE is invalid.");
    if (!/^[a-zA-Z0-9:_-]{1,80}$/.test(keyPrefix)) throw new Error("AUTH_KEY_PREFIX is invalid.");
    if (!Number.isInteger(sessionTtlSeconds) || sessionTtlSeconds < 60 || sessionTtlSeconds > 86400) {
        throw new Error("AUTH_SESSION_TTL_SECONDS must be 60..86400.");
    }
    return { mongodbUri, mongodbDatabase, redisUrl, keyPrefix, sessionTtlSeconds };
}
