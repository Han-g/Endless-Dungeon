import { listen } from "@colyseus/tools";
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { authRuntime } from "./auth/runtime.js";

config({ path: fileURLToPath(new URL("../.env.local", import.meta.url)), quiet: true });

async function main(): Promise<void> {
    await authRuntime.service.start();
    const { default: app } = await import("./app.config.js");
    try {
        await listen(app);
    } catch (error) {
        await app.gracefullyShutdown(false);
        throw error;
    }
}

void main().catch(async (error: unknown) => {
    console.error("[Startup] FAILED", error instanceof Error ? error.message : "Unknown");
    await authRuntime.service.stop();
    process.exitCode = 1;
});
