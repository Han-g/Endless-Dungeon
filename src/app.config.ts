import { defineServer, defineRoom, monitor, playground } from "colyseus";
import { authRuntime } from "./auth/runtime.js";
import { createAuthRouter } from "./auth/auth.routes.js";
import { WaitingRoom } from "./rooms/WaitingRoom.js";
import { AuthenticatedLobbyRoom } from "./rooms/AuthenticatedLobbyRoom.js";

const server = defineServer({
    beforeListen: () => authRuntime.initialize(),
    rooms: {
        waiting_room: defineRoom(WaitingRoom).enableRealtimeListing(),
        lobby: defineRoom(AuthenticatedLobbyRoom)
    },
    express: app => {
        app.use("/api/auth", createAuthRouter(() => authRuntime.service));
        app.get("/health", (_req, res) => res.status(authRuntime.isReady ? 200 : 503).json({ ok: authRuntime.isReady }));
        if (process.env.NODE_ENV !== "production") {
            app.use("/monitor", monitor());
            app.use("/", playground());
        }
    }
});
server.onShutdown(() => authRuntime.close());
export default server;
