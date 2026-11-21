import { defineServer, defineRoom, monitor, playground } from "colyseus";
import { WaitingRoom } from "./rooms/WaitingRoom.js";
import { AuthenticatedLobbyRoom } from "./rooms/AuthenticatedLobbyRoom.js";
import { createAuthRouter } from "./auth/routes.js";
import { authRuntime } from "./auth/runtime.js";

const server = defineServer({
    beforeListen: () => authRuntime.service.start(),
    rooms: {
        waiting_room: defineRoom(WaitingRoom).enableRealtimeListing(),
        lobby: defineRoom(AuthenticatedLobbyRoom)
    },
    express: app => {
        app.use("/api/auth", createAuthRouter());
        app.get("/health", (_req, res) => {
            res.status(authRuntime.service.isReady ? 200 : 503)
                .json({ ok: authRuntime.service.isReady });
        });

        if (process.env.NODE_ENV !== "production") {
            app.use("/monitor", monitor());
            app.use("/", playground());
        }
    }
});

server.onShutdown(() => authRuntime.service.stop());

export default server;
