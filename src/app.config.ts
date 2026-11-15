import {
    defineServer, defineRoom, monitor, playground, createRouter, createEndpoint
} from "colyseus";
import { GameRoom } from "./rooms/GameRoom.js";
import { authRuntime } from "./auth/runtime.js";
import { createAuthRouter } from "./auth/auth.routes.js";
import { WaitingRoom } from "./rooms/WaitingRoom.js";
import { AuthenticatedLobbyRoom } from "./rooms/AuthenticatedLobbyRoom.js";

const server = defineServer({
    rooms: {
        my_room: defineRoom(GameRoom),

	waiting_room: defineRoom(WaitingRoom).enableRealtimeListing(),

	lobby: defineRoom(AuthenticatedLobbyRoom)
    },
    routes: createRouter({
        api_hello: createEndpoint("/api/hello", { method: "GET" }, async () => {
            return { message: "Hello World" };
        })
    }),
    beforeListen: () => authRuntime.initialize(),
    express: app => {
        app.use("/api/auth", createAuthRouter(() => authRuntime.service));
        app.get("/hi", (_request, response) => {
            response.send("It's time to kick ass and chew bubblegum!");
        });
        app.use("/monitor", monitor());
        if (process.env.NODE_ENV !== "production") {
            app.use("/", playground());
        }
    }
});

server.onShutdown(() => authRuntime.close());
export default server;
