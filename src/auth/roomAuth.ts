import type { Client } from "colyseus";
import type { SessionCloseReason } from "./contracts.js";
import { ServerError } from "colyseus";
import { AuthError } from "./contracts.js";

export async function authForRoom<T>(action: () => Promise<T>): Promise<T> {
    try { return await action(); }
    catch (error) {
        if (error instanceof AuthError) throw new ServerError(error.status, error.message);
        throw new ServerError(503, "인증 서비스를 확인하세요.");
    }
}

const closing = new WeakSet<Client>();
export function isAuthClosing(client: Client): boolean { return closing.has(client); }

export function closeAuthConnection(client: Client, roomId: string, source: string, reason: SessionCloseReason): void {
    if (closing.has(client)) return;
    closing.add(client);
    console.warn("[Auth] room_disconnect", { at: new Date().toISOString(), code: 4401, roomId, source, reason });
    client.leave(4401);
}

interface GameLease { roomId: string; sessionId: string; }
// 게임방은 단일 프로세스에서 실행합니다. 다중 프로세스 전환 시 이 점유도 공유 저장소로 옮겨야 합니다.
const gameLeases = new Map<string, GameLease>();
export function claimGameAccount(accountId: string, roomId: string, sessionId: string): boolean {
    if (gameLeases.has(accountId)) return false;
    gameLeases.set(accountId, { roomId, sessionId });
    return true;
}
export function releaseGameAccount(accountId: string, roomId: string, sessionId: string): void {
    const lease = gameLeases.get(accountId);
    if (lease?.roomId === roomId && lease.sessionId === sessionId) gameLeases.delete(accountId);
}
