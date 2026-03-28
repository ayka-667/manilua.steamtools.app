import { getMySqlPool } from "./mysql";
import { getDailyReportStats } from "./stats-store";
import {
  renderOverviewReportImage,
  renderTopGamesReportImage,
  renderTopUsersReportImage
} from "./admin-report-images";

const REPORT_TIME_ZONE = "Europe/Paris";
const REPORT_TYPE = "daily_discord_recap";

function getReportChannelId() {
  const channelId = process.env.DISCORD_DAILY_RECAP_CHANNEL_ID;
  if (!channelId) {
    throw new Error("DISCORD_DAILY_RECAP_CHANNEL_ID is missing.");
  }
  return channelId;
}

function getTimeZoneParts(date, timeZone) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second)
  };
}

function shiftDateParts(parts, deltaDays) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate()
  };
}

function getTimeZoneOffsetMs(date, timeZone) {
  const parts = getTimeZoneParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedMidnightToUtcMs(parts, timeZone) {
  const utcGuess = Date.UTC(parts.year, parts.month - 1, parts.day, 0, 0, 0);
  let offset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utcMs = utcGuess - offset;
  const refinedOffset = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  if (refinedOffset !== offset) {
    utcMs = utcGuess - refinedOffset;
  }
  return utcMs;
}

function formatReportKey(parts) {
  return `${REPORT_TYPE}:${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function formatDisplayDate(parts) {
  return `${String(parts.day).padStart(2, "0")}/${String(parts.month).padStart(2, "0")}/${parts.year}`;
}

async function reserveReport(reportKey) {
  const pool = await getMySqlPool();
  const [result] = await pool.query(
    `INSERT IGNORE INTO scheduled_reports (report_key, report_type, created_at_ms)
     VALUES (?, ?, ?)`,
    [reportKey, REPORT_TYPE, Date.now()]
  );
  return Number(result?.affectedRows || 0) > 0;
}

function getDiscordBotToken() {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    throw new Error("DISCORD_BOT_TOKEN is missing.");
  }
  return botToken;
}

async function fetchChannelMessages(botToken, before = "") {
  const url = new URL(`https://discord.com/api/v10/channels/${getReportChannelId()}/messages`);
  url.searchParams.set("limit", "100");
  if (before) {
    url.searchParams.set("before", before);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bot ${botToken}`
    },
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Discord fetch messages failed (${response.status}): ${errorText || "unknown error"}`);
  }

  return response.json();
}

async function deleteChannelMessage(botToken, messageId) {
  const response = await fetch(`https://discord.com/api/v10/channels/${getReportChannelId()}/messages/${messageId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bot ${botToken}`
    },
    cache: "no-store"
  });

  if (!response.ok && response.status !== 404) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Discord delete failed (${response.status}): ${errorText || "unknown error"}`);
  }
}

async function clearReportChannel() {
  const botToken = getDiscordBotToken();
  let before = "";

  for (;;) {
    const messages = await fetchChannelMessages(botToken, before);
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    for (const message of messages) {
      await deleteChannelMessage(botToken, message.id);
    }

    before = messages[messages.length - 1]?.id || "";
    if (messages.length < 100) {
      return;
    }
  }
}

async function sendDiscordDailyRecap({ content, files }) {
  const botToken = getDiscordBotToken();
  const channelId = getReportChannelId();

  const form = new FormData();
  form.append("payload_json", JSON.stringify({ content, allowed_mentions: { parse: [] } }));

  files.forEach((file, index) => {
    form.append(`files[${index}]`, new Blob([file.buffer], { type: "image/png" }), file.name);
  });

  const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bot ${botToken}`
    },
    body: form,
    cache: "no-store"
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(`Discord send failed (${response.status}): ${errorText || "unknown error"}`);
  }
}

export async function runDailyDiscordReport({ force = false } = {}) {
  const now = new Date();
  const parisNow = getTimeZoneParts(now, REPORT_TIME_ZONE);

  if (!force && ![0, 23].includes(parisNow.hour)) {
    return {
      ok: true,
      skipped: true,
      reason: "outside_daily_recap_window"
    };
  }

  const reportDate = parisNow.hour === 0 ? shiftDateParts(parisNow, -1) : {
    year: parisNow.year,
    month: parisNow.month,
    day: parisNow.day
  };
  const reportKey = formatReportKey(reportDate);
  const reserved = await reserveReport(reportKey);

  if (!reserved) {
    return {
      ok: true,
      skipped: true,
      reason: "already_sent",
      reportKey
    };
  }

  const startMs = zonedMidnightToUtcMs(reportDate, REPORT_TIME_ZONE);
  const nextDate = shiftDateParts(reportDate, 1);
  const endMs = zonedMidnightToUtcMs(nextDate, REPORT_TIME_ZONE);
  const dateLabel = formatDisplayDate(reportDate);
  const stats = await getDailyReportStats(startMs, endMs);

  const [overviewBuffer, topGamesBuffer, topUsersBuffer] = await Promise.all([
    renderOverviewReportImage({
      dateLabel,
      dayOverview: stats.dayOverview,
      allTimeOverview: stats.allTimeOverview,
      latestDownload: stats.latestDownload
    }).arrayBuffer(),
    renderTopGamesReportImage({
      dateLabel,
      topGames: stats.topGames
    }).arrayBuffer(),
    renderTopUsersReportImage({
      dateLabel,
      topUsers: stats.topUsers
    }).arrayBuffer()
  ]);

  await clearReportChannel();

  await sendDiscordDailyRecap({
    content: `Daily recap for ${dateLabel}.\nOverview, top games, and top users are attached below.`,
    files: [
      { name: `overview-${dateLabel.replace(/\//g, "-")}.png`, buffer: overviewBuffer },
      { name: `top-games-${dateLabel.replace(/\//g, "-")}.png`, buffer: topGamesBuffer },
      { name: `top-users-${dateLabel.replace(/\//g, "-")}.png`, buffer: topUsersBuffer }
    ]
  });

  return {
    ok: true,
    skipped: false,
    reportKey,
    dateLabel
  };
}
