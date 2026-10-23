import {
    LobbyRoom,
    ServerError
} from "colyseus";

import { authRuntime } from "../auth/runtime.js";

import type { UserProfile } from "../auth/contracts.js";

export class AuthenticatedLobbyRoom extends LobbyRoom {
    public static async onAuth(
        token: string
    ): Promise<UserProfile> {
        try {
            return await authRuntime.service.me(token);
        } catch {
            throw new ServerError(
                401,
                "로그인이 필요합니다."
            );
        }
    }
}