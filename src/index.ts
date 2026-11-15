import { listen } from "@colyseus/tools";
import { authRuntime } from "./auth/runtime.js";

async function main(): Promise<void> {
    await authRuntime.initialize();
    const { default: app } = await import("./app.config.js");
    try { await listen(app); }
    catch (error) {
        await app.gracefullyShutdown(false);
        throw error;
    }
}
void main().catch(async (error: unknown) => {
    console.error("[Startup] FAILED", error instanceof Error ? error.name : "Unknown");
    await authRuntime.close();
    process.exitCode = 1;
});
