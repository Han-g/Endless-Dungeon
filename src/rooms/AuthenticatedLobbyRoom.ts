import { LobbyRoom } from "colyseus";
import { authRuntime } from "../auth/runtime.js";
import { authForRoom } from "../auth/roomAuth.js";

export class AuthenticatedLobbyRoom extends LobbyRoom {
    private readonly detachAuth = new Map<string, () => void>();

    public static async onAuth(token: string) {
        return authForRoom(() => authRuntime.service.authenticate(token));
    }

    public override async onJoin(...args: Parameters<LobbyRoom["onJoin"]>) {
        const client = args[0];
        const detach = await authForRoom(() => authRuntime.service.watch(client.auth, () => client.leave(4401)));
        this.detachAuth.set(client.sessionId, detach);
        try { return super.onJoin(...args); }
        catch (error) {
            detach();
            this.detachAuth.delete(client.sessionId);
            throw error;
        }
    }
    public override onLeave(...args: Parameters<LobbyRoom["onLeave"]>) {
        this.detachAuth.get(args[0].sessionId)?.();
        this.detachAuth.delete(args[0].sessionId);
        return super.onLeave(...args);
    }
    public override onDispose(...args: Parameters<LobbyRoom["onDispose"]>) {
        for (const detach of this.detachAuth.values()) detach();
        this.detachAuth.clear();
        return super.onDispose(...args);
    }
}
