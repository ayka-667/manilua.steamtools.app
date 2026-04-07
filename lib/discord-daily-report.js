import { getMySqlPool } from "./mysql";
import { screenshotReportCard } from "./report-screenshot";
import { formatDisplayDate, formatIsoDate, getTimeZoneParts, REPORT_TIME_ZONE, shiftDateParts } from "./report-time";
const REPORT_TYPE = "daily_discord_recap";

function getReportChannelId() {
  const channelId = process.env.DISCORD_DAILY_RECAP_CHANNEL_ID;
  if (!channelId) {
    throw new Error("DISCORD_DAILY_RECAP_CHANNEL_ID is missing.");
  }
  return channelId;
}

function formatReportKey(parts) {
  return `${REPORT_TYPE}:${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
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

async function clearReportChannel({ keepId = "" } = {}) {
  const botToken = getDiscordBotToken();
  let before = "";

  for (;;) {
    const messages = await fetchChannelMessages(botToken, before);
    if (!Array.isArray(messages) || messages.length === 0) {
      return;
    }

    for (const message of messages) {
      if (keepId && message.id === keepId) {
        continue;
      }
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
  return response.json();
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

  const dateLabel = formatDisplayDate(reportDate);
  const reportDateIso = formatIsoDate(reportDate);

  const combinedBuffer = await screenshotReportCard({
    card: "combined",
    date: reportDateIso,
    token: process.env.CRON_SECRET || ""
  });

  const sentMessage = await sendDiscordDailyRecap({
    content: `Daily recap for ${dateLabel}.\nOverview, top games, and top users are combined in the attached image.`,
    files: [
      { name: `daily-recap-${dateLabel.replace(/\//g, "-")}.png`, buffer: combinedBuffer }
    ]
  });
  const sentId = sentMessage?.id || "";

  await clearReportChannel({ keepId: sentId });

  return {
    ok: true,
    skipped: false,
    reportKey,
    dateLabel
  };
}
