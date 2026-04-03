import { runDailyDiscordReport } from "./discord-daily-report";
import { getTimeZoneParts, REPORT_TIME_ZONE } from "./report-time";

const CHECK_INTERVAL_MS = 60_000;
const TARGET_HOURS = new Set([23, 0]);

function schedulerEnabled() {
  return process.env.DISABLE_INTERNAL_DAILY_RECAP_SCHEDULER !== "1";
}

function getSchedulerState() {
  if (!globalThis.__steamToolsDailyRecapScheduler) {
    globalThis.__steamToolsDailyRecapScheduler = {
      started: false,
      timer: null,
      running: false,
      lastTickKey: ""
    };
  }

  return globalThis.__steamToolsDailyRecapScheduler;
}

async function tick() {
  const state = getSchedulerState();
  const now = new Date();
  const parisNow = getTimeZoneParts(now, REPORT_TIME_ZONE);
  const tickKey = `${parisNow.year}-${parisNow.month}-${parisNow.day}-${parisNow.hour}-${parisNow.minute}`;

  if (state.running || state.lastTickKey === tickKey) {
    return;
  }

  state.lastTickKey = tickKey;

  if (!TARGET_HOURS.has(parisNow.hour)) {
    return;
  }

  state.running = true;

  try {
    const result = await runDailyDiscordReport();
    if (!result?.skipped) {
      console.log("[daily-recap] report sent", result);
    }
  } catch (error) {
    console.error("[daily-recap] scheduler error", error);
  } finally {
    state.running = false;
  }
}

export function startDailyRecapScheduler() {
  if (!schedulerEnabled()) {
    return false;
  }

  const state = getSchedulerState();
  if (state.started) {
    return true;
  }

  state.started = true;
  state.timer = setInterval(() => {
    void tick();
  }, CHECK_INTERVAL_MS);

  if (typeof state.timer?.unref === "function") {
    state.timer.unref();
  }

  void tick();
  console.log("[daily-recap] internal scheduler started");
  return true;
}
