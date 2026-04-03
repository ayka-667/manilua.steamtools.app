export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { startDailyRecapScheduler } = await import("./lib/daily-recap-scheduler");
  startDailyRecapScheduler();
}
