import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { Client, type Room } from "@colyseus/sdk";
import { cli, type Options } from "@colyseus/loadtest";

config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });

function command(room: Room, type: string, body: object = {}): Promise<void> {
    return new Promise((resolveCommand, reject) => {
        const requestId = randomUUID().replaceAll("-", "");
        const timeout = setTimeout(() => {
            detach();
            reject(new Error(`COMMAND_TIMEOUT:${type}`));
        }, 5000);
        const detach = room.onMessage("room/result", (result: {
            requestId: string; ok: boolean; error: string;
        }) => {
            if (result.requestId !== requestId) return;
            clearTimeout(timeout);
            detach();
            if (result.ok) resolveCommand();
            else reject(new Error(result.error));
        });
        room.send(type, { ...body, requestId });
    });
}

// 클라이언트마다 서로 다른 기존 계정으로 1인 방을 생성하고 게임을 시작합니다.
export async function main(options: Options): Promise<void> {
    const ids = (process.env.LOADTEST_LOGIN_IDS ?? "").split(",").map(id => id.trim()).filter(Boolean);
    const password = process.env.LOADTEST_PASSWORD;
    if (options.roomId || !password || ids.length < options.numClients || new Set(ids).size !== ids.length) {
        throw new Error("LOADTEST_LOGIN_IDS에 클라이언트 수만큼 서로 다른 계정과 LOADTEST_PASSWORD를 설정하세요. --roomId는 지원하지 않습니다.");
    }
    const endpoint = new URL(options.endpoint);
    endpoint.protocol = endpoint.protocol === "wss:" ? "https:" : "http:";
    endpoint.pathname = "/api/auth/login";
    const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginId: ids[options.clientId], password })
    });
    if (!response.ok) throw new Error(`LOGIN_FAILED:${response.status}`);
    const login = await response.json() as { accessToken: string };
    const sdk = new Client(options.endpoint);
    sdk.auth.token = login.accessToken;
    const room = await sdk.create(options.roomName, { roomTitle: `부하 테스트 ${options.clientId + 1}` });
    room.reconnection.enabled = false;
    room.onError((code, message) => console.error(`room error ${code}: ${message}`));
    try {
        await command(room, "room/ready", { ready: true, characterId: 1 });
        await command(room, "room/start");
        await command(room, "game/loaded");
    } catch (error) {
        await room.leave();
        throw error;
    }
    let sequence = 0;
    const timer = setInterval(() => {
        if (room.state.game.phase !== "playing") return;
        room.send("input/move", {
            x: Math.sin(sequence / 30), y: Math.cos(sequence / 30), sequence: ++sequence
        });
    }, 50);
    room.onLeave(() => clearInterval(timer));
}

cli(main);
