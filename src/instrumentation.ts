export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_SCHEDULER !== "true") {
    const { startScheduler } = await import("./lib/scheduler");
    startScheduler();
  }
}
