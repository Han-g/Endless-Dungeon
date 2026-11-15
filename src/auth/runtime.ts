import { MongoClient } from "mongodb";
import { Redis } from "ioredis";
import type { AccountDocument } from "./contracts.js";
import { AuthError } from "./contracts.js";
import { readAuthConfig } from "./config.js";
import { AccountRepository } from "./AccountRepository.js";
import { SessionRepository } from "./SessionRepository.js";
import { AuthService } from "./AuthService.js";

export class AuthRuntime {
    private mongodb?: MongoClient;
    private redis?: Redis;
    private authService?: AuthService;

    public get service(): AuthService {
        if (!this.authService) throw new AuthError(503, "SERVICE_UNAVAILABLE", "로그인 서비스를 사용할 수 없습니다.");
        return this.authService;
    }

    public async initialize(): Promise<void> {
        if (this.authService) return;
        const config = readAuthConfig();
        this.mongodb = new MongoClient(config.mongodbUri, {
            serverSelectionTimeoutMS: 3000, connectTimeoutMS: 3000,
            socketTimeoutMS: 3000, maxPoolSize: 10
        });
        this.redis = new Redis(config.redisUrl, {
            lazyConnect: true, enableOfflineQueue: false,
            connectTimeout: 3000, commandTimeout: 1500, maxRetriesPerRequest: 1,
            retryStrategy: count => count > 5 ? null : Math.min(count * 200, 1000)
        });
        this.redis.on("error", () => console.error("[Auth] Redis connection unavailable."));
        try {
            await Promise.all([this.mongodb.connect(), this.redis.connect()]);
            await this.redis.ping();
            const accounts = new AccountRepository(
                this.mongodb.db(config.mongodbDatabase).collection<AccountDocument>("accounts")
            );
            await accounts.ensureIndexes();
            this.authService = new AuthService(
                accounts, new SessionRepository(this.redis, config.keyPrefix, config.sessionTtlSeconds)
            );
            console.info("[Auth] MongoDB and Redis ready.");
        } catch (error) {
            await this.close();
            throw error;
        }
    }

    public async close(): Promise<void> {
        this.authService = undefined;
        const redis = this.redis;
        const mongodb = this.mongodb;
        this.redis = undefined;
        this.mongodb = undefined;
        redis?.disconnect();
        await mongodb?.close();
    }
}

export const authRuntime = new AuthRuntime();
