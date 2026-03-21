import { getMySqlPool } from "./mysql";

const DAY_MS = 86_400_000;

function getUtcDayStartMs(nowMs) {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export async function recordDownloadEvent({ userId, actionId, appid, gameName, tier }) {
  const pool = await getMySqlPool();
  const nowMs = Date.now();
  await pool.query(
    `INSERT INTO download_events (user_id, action_id, appid, game_name, tier, created_at_ms)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [String(userId), String(actionId), String(appid), String(gameName || "Unknown Game"), String(tier), nowMs]
  );
}

export async function getAdminStats() {
  const pool = await getMySqlPool();
  const nowMs = Date.now();
  const dayStartMs = getUtcDayStartMs(nowMs);
  const last24hMs = nowMs - DAY_MS;

  const [[overviewRow]] = await pool.query(
    `SELECT
       COUNT(*) AS totalDownloads,
       SUM(CASE WHEN created_at_ms >= ? THEN 1 ELSE 0 END) AS downloadsTodayUtc,
       SUM(CASE WHEN created_at_ms >= ? THEN 1 ELSE 0 END) AS downloadsLast24h,
       COUNT(DISTINCT CASE WHEN created_at_ms >= ? THEN user_id END) AS uniqueUsersLast24h,
       SUM(CASE WHEN action_id = 'downloadManifest' THEN 1 ELSE 0 END) AS manifestDownloads,
       SUM(CASE WHEN action_id = 'downloadLua' THEN 1 ELSE 0 END) AS luaDownloads
     FROM download_events`,
    [dayStartMs, last24hMs, last24hMs]
  );

  const [topGames] = await pool.query(
    `SELECT
       appid,
       MAX(game_name) AS gameName,
       COUNT(*) AS totalDownloads,
       SUM(CASE WHEN action_id = 'downloadManifest' THEN 1 ELSE 0 END) AS manifestDownloads,
       SUM(CASE WHEN action_id = 'downloadLua' THEN 1 ELSE 0 END) AS luaDownloads,
       MAX(created_at_ms) AS lastDownloadedAt
     FROM download_events
     GROUP BY appid
     ORDER BY totalDownloads DESC, lastDownloadedAt DESC
     LIMIT 15`
  );

  const [topUsers] = await pool.query(
    `SELECT
       user_id AS userId,
       COUNT(*) AS totalDownloads,
       SUM(CASE WHEN tier = 'premium' THEN 1 ELSE 0 END) AS premiumDownloads,
       SUM(CASE WHEN tier = 'standard' THEN 1 ELSE 0 END) AS standardDownloads,
       MAX(created_at_ms) AS lastDownloadAt
     FROM download_events
     GROUP BY user_id
     ORDER BY totalDownloads DESC, lastDownloadAt DESC
     LIMIT 15`
  );

  const [downloadsByHour] = await pool.query(
    `SELECT
       HOUR(FROM_UNIXTIME(created_at_ms / 1000)) AS hourUtc,
       COUNT(*) AS totalDownloads
     FROM download_events
     WHERE created_at_ms >= ?
     GROUP BY hourUtc
     ORDER BY hourUtc ASC`,
    [last24hMs]
  );

  const [recentDownloads] = await pool.query(
    `SELECT
       user_id AS userId,
       action_id AS actionId,
       appid,
       game_name AS gameName,
       tier,
       created_at_ms AS createdAt
     FROM download_events
     ORDER BY created_at_ms DESC
     LIMIT 20`
  );

  return {
    overview: {
      totalDownloads: Number(overviewRow?.totalDownloads || 0),
      downloadsTodayUtc: Number(overviewRow?.downloadsTodayUtc || 0),
      downloadsLast24h: Number(overviewRow?.downloadsLast24h || 0),
      uniqueUsersLast24h: Number(overviewRow?.uniqueUsersLast24h || 0),
      manifestDownloads: Number(overviewRow?.manifestDownloads || 0),
      luaDownloads: Number(overviewRow?.luaDownloads || 0)
    },
    topGames: topGames.map((row) => ({
      appid: row.appid,
      gameName: row.gameName,
      totalDownloads: Number(row.totalDownloads || 0),
      manifestDownloads: Number(row.manifestDownloads || 0),
      luaDownloads: Number(row.luaDownloads || 0),
      lastDownloadedAt: Number(row.lastDownloadedAt || 0)
    })),
    topUsers: topUsers.map((row) => ({
      userId: row.userId,
      totalDownloads: Number(row.totalDownloads || 0),
      premiumDownloads: Number(row.premiumDownloads || 0),
      standardDownloads: Number(row.standardDownloads || 0),
      lastDownloadAt: Number(row.lastDownloadAt || 0)
    })),
    downloadsByHour: downloadsByHour.map((row) => ({
      hourUtc: Number(row.hourUtc || 0),
      totalDownloads: Number(row.totalDownloads || 0)
    })),
    recentDownloads: recentDownloads.map((row) => ({
      userId: row.userId,
      actionId: row.actionId,
      appid: row.appid,
      gameName: row.gameName,
      tier: row.tier,
      createdAt: Number(row.createdAt || 0)
    }))
  };
}
