import express, {
    type Request, type Response, type RequestHandler, type ErrorRequestHandler
} from "express";
import { authRuntime } from "./runtime.js";
import { AuthError } from "./contracts.js";

function asyncRoute(
    action: (req: Request, res: Response) => Promise<void>
): RequestHandler {
    return (req, res, next) => { void action(req, res).catch(next); };
}

function bearer(req: Request): string {
    const header = req.get("authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(header);
    if (!match) throw new AuthError(401, "UNAUTHORIZED", "로그인이 필요합니다.");
    return match[1];
}

// 직접 접속하는 단일 프로세스 개발 서버 기준 IP 제한입니다.
// 프록시 배포 시에는 신뢰할 프록시와 req.ip 정책을 별도로 설정합니다.
function rateLimit(limit: number): RequestHandler {
    const buckets = new Map<string, { count: number; resetAt: number }>();
    let nextCleanup = 0;

    return (req, res, next) => {
        const now = Date.now();
        if (now >= nextCleanup) {
            for (const [key, bucket] of buckets) {
                if (bucket.resetAt <= now) buckets.delete(key);
            }
            nextCleanup = now + 60000;
        }

        const key = req.socket.remoteAddress ?? "unknown";
        let bucket = buckets.get(key);
        if (!bucket || bucket.resetAt <= now) {
            if (!bucket && buckets.size >= 10000) {
                next(new AuthError(503, "AUTH_BUSY", "잠시 후 다시 시도하세요."));
                return;
            }
            bucket = { count: 0, resetAt: now + 60000 };
            buckets.set(key, bucket);
        }
        bucket.count++;
        if (bucket.count > limit) {
            res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
            next(new AuthError(429, "RATE_LIMITED", "요청이 많습니다. 잠시 후 다시 시도하세요."));
            return;
        }
        next();
    };
}

export function createAuthRouter(): express.Router {
    const router = express.Router();
    router.use((_req, res, next) => {
        res.setHeader("Cache-Control", "no-store");
        next();
    });
    router.use(rateLimit(120));
    router.use(express.json({ limit: "16kb" }));

    router.post("/register", rateLimit(5), asyncRoute(async (req, res) => {
        const user = await authRuntime.service.register(req.body);
        res.status(201).json({ user });
    }));

    router.post("/login", rateLimit(10), asyncRoute(async (req, res) => {
        res.json(await authRuntime.service.login(req.body));
    }));

    router.get("/me", asyncRoute(async (req, res) => {
        res.json({ user: authRuntime.service.me(bearer(req)) });
    }));

    router.post("/logout", asyncRoute(async (req, res) => {
        authRuntime.service.logout(bearer(req));
        res.status(204).end();
    }));

    router.use((_req, res) => {
        res.status(404).json({ error: "NOT_FOUND", message: "없는 인증 API입니다." });
    });

    const errors: ErrorRequestHandler = (error, _req, res, _next) => {
        if (error instanceof AuthError) {
            res.status(error.status).json({ error: error.code, message: error.message });
            return;
        }
        const parsed = error as { type?: string } | null;
        if (parsed?.type === "entity.parse.failed") {
            res.status(400).json({ error: "INVALID_JSON", message: "JSON 형식을 확인하세요." });
            return;
        }
        if (parsed?.type === "entity.too.large") {
            res.status(413).json({ error: "BODY_TOO_LARGE", message: "요청 본문이 너무 큽니다." });
            return;
        }
        console.error("[Auth] REQUEST_FAILED", error instanceof Error ? error.name : "Unknown");
        res.status(500).json({ error: "INTERNAL_ERROR", message: "서버 오류가 발생했습니다." });
    };
    router.use(errors);
    return router;
}
