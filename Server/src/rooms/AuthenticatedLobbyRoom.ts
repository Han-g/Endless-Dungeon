import { LobbyRoom } from "colyseus";
import { authRuntime, authForRoom } from "../auth/runtime.js";

export class AuthenticatedLobbyRoom extends LobbyRoom {
    private readonly detachAuth = new Map<string, () => void>();

    public static async onAuth(token: string) {
        return authForRoom(() => authRuntime.service.authenticate(token));
    }

    public override onJoin(...args: Parameters<LobbyRoom["onJoin"]>) {
        const client = args[0];
        const detach = authForRoom(() => authRuntime.service.watch(
            client.auth,
            () => client.leave(4401)
        ));
        this.detachAuth.set(client.sessionId, detach);
        return super.onJoin(...args);
    }

    public override onLeave(...args: Parameters<LobbyRoom["onLeave"]>) {
        const client = args[0];
        this.detachAuth.get(client.sessionId)?.();
        this.detachAuth.delete(client.sessionId);
        return super.onLeave(...args);
    }

    public override onDispose(...args: Parameters<LobbyRoom["onDispose"]>) {
        for (const detach of this.detachAuth.values()) detach();
        this.detachAuth.clear();
        return super.onDispose(...args);
    }
}
