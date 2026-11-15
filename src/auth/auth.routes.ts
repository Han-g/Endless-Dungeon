import express from "express";
import type { Request, RequestHandler, ErrorRequestHandler } from "express";
import { AuthError } from "./contracts.js";
import type { AuthService } from "./AuthService.js";

const asyncRoute = (
    handler: (request: Request, response: express.Response) => Promise<void>
): RequestHandler => (request, response, next) => {
    void Promise.resolve().then(() => handler(request, response)).catch(next);
};

function bearerToken(request: Request): string {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/i.exec(request.get("Authorization") ?? "");
    if (!match) throw new AuthError(401, "INVALID_SESSION", "다시 로그인하세요.");
    return match[1];
}

export function createAuthRouter(getService: () => AuthService): express.Router {
    const router = express.Router();
    router.use((_request, response, next) => {
        response.setHeader("Cache-Control", "no-store");
        next();
    });
    router.use(express.json({ limit: "4kb", strict: true }));
    router.post("/login", asyncRoute(async (request, response) => {
        const body = request.body as Record<string, unknown> | null;
        const result = await getService().login(
            body?.loginId, body?.password,
            request.ip ?? request.socket.remoteAddress ?? "unknown"
        );
        response.status(200).json(result);
    }));
    router.get("/me", asyncRoute(async (request, response) => {
        response.status(200).json({ user: await getService().me(bearerToken(request)) });
    }));
    router.post("/logout", asyncRoute(async (request, response) => {
        await getService().logout(bearerToken(request));
        response.status(204).end();
    }));
    const handleError: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
        if (error instanceof AuthError) {
            if (error.retryAfter !== undefined) response.setHeader("Retry-After", String(error.retryAfter));
            response.status(error.status).json({ error: error.code, message: error.message });
            return;
        }
        const parserError = error as { type?: string; name?: string } | null;
        if (parserError?.type === "entity.parse.failed" || parserError?.type === "entity.too.large") {
            response.status(parserError.type === "entity.too.large" ? 413 : 400)
                .json({ error: "VALIDATION_ERROR", message: "로그인 요청 형식이 올바르지 않습니다." });
            return;
        }
        console.error("[Auth] Request failed:", parserError?.name ?? "UnknownError");
        response.status(503).json({
            error: "SERVICE_UNAVAILABLE",
            message: "로그인 서비스를 사용할 수 없습니다. 잠시 후 다시 시도하세요."
        });
    };
    router.use(handleError);
    return router;
}
