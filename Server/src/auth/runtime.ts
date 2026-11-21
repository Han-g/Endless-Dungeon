import { ServerError } from "colyseus";
import { AuthService } from "./AuthService.js";
import { AuthError } from "./contracts.js";

export const authRuntime = { service: new AuthService() };

export function authForRoom<T>(action: () => T): T {
    try {
        return action();
    } catch (error) {
        if (error instanceof AuthError) {
            throw new ServerError(error.status, error.message);
        }
        throw new ServerError(503, "인증 서버를 확인하세요.");
    }
}

interface GameLease {
    roomId: string;
    sessionId: string;
}

const gameLeases = new Map<string, GameLease>();

export function claimGameAccount(
    accountId: string, roomId: string, sessionId: string
): boolean {
    if (gameLeases.has(accountId)) return false;
    gameLeases.set(accountId, { roomId, sessionId });
    return true;
}

export function releaseGameAccount(
    accountId: string, roomId: string, sessionId: string
): void {
    const lease = gameLeases.get(accountId);
    if (lease?.roomId === roomId && lease.sessionId === sessionId) {
        gameLeases.delete(accountId);
    }
}
