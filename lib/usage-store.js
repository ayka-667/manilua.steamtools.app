import { getMySqlPool } from "./mysql";

const DAY_MS = 86_400_000;

function getUtcDayStartMs(nowMs) {
  const d = new Date(nowMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

async function getOrCreateRow(conn, userId, dailyLimit, nowMs) {
  const dayStartMs = getUtcDayStartMs(nowMs);
  const [rows] = await conn.query("SELECT * FROM user_download_usage WHERE user_id = ? FOR UPDATE", [userId]);

  if (rows.length === 0) {
    await conn.query(
      `INSERT INTO user_download_usage
       (user_id, day_start_ms, daily_count, daily_limit, cooldown_until_ms, updated_at_ms)
       VALUES (?, ?, 0, ?, 0, ?)`,
      [userId, dayStartMs, dailyLimit, nowMs]
    );
    return {
      user_id: userId,
      day_start_ms: dayStartMs,
      daily_count: 0,
      daily_limit: dailyLimit,
      cooldown_until_ms: 0,
      updated_at_ms: nowMs
    };
  }

  return rows[0];
}

function normalizeRowForToday(row, dailyLimit, nowMs) {
  const dayStartMs = getUtcDayStartMs(nowMs);
  const next = { ...row };

  if (Number(row.day_start_ms) !== dayStartMs) {
    next.day_start_ms = dayStartMs;
    next.daily_count = 0;
    next.cooldown_until_ms = 0;
  }

  next.daily_limit = dailyLimit;
  return next;
}

export async function getUsageForUser(userId, dailyLimit, cooldownMs) {
  const pool = await getMySqlPool();
  const conn = await pool.getConnection();
  const nowMs = Date.now();

  try {
    await conn.beginTransaction();
    const row = await getOrCreateRow(conn, userId, dailyLimit, nowMs);
    const normalized = normalizeRowForToday(row, dailyLimit, nowMs);

    await conn.query(
      `UPDATE user_download_usage
       SET day_start_ms = ?, daily_count = ?, daily_limit = ?, cooldown_until_ms = ?, updated_at_ms = ?
       WHERE user_id = ?`,
      [
        normalized.day_start_ms,
        normalized.daily_count,
        normalized.daily_limit,
        normalized.cooldown_until_ms,
        nowMs,
        userId
      ]
    );

    await conn.commit();

    const used = Number(normalized.daily_count) || 0;
    const cooldownUntilMs = Number(normalized.cooldown_until_ms) || 0;
    return {
      dailyLimit,
      downloadsUsedToday: used,
      downloadsRemaining: Math.max(dailyLimit - used, 0),
      cooldownSec: cooldownUntilMs > nowMs ? Math.ceil((cooldownUntilMs - nowMs) / 1000) : 0,
      dayResetAt: Number(normalized.day_start_ms) + DAY_MS
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function consumeDownloadQuota(userId, dailyLimit, cooldownMs) {
  const pool = await getMySqlPool();
  const conn = await pool.getConnection();
  const nowMs = Date.now();

  try {
    await conn.beginTransaction();
    const row = await getOrCreateRow(conn, userId, dailyLimit, nowMs);
    const normalized = normalizeRowForToday(row, dailyLimit, nowMs);

    const cooldownUntilMs = Number(normalized.cooldown_until_ms) || 0;
    if (cooldownUntilMs > nowMs) {
      await conn.rollback();
      return {
        ok: false,
        reason: "cooldown",
        retryAfterSec: Math.ceil((cooldownUntilMs - nowMs) / 1000)
      };
    }

    const used = Number(normalized.daily_count) || 0;
    if (used >= dailyLimit) {
      const retryAfterSec = Math.ceil((Number(normalized.day_start_ms) + DAY_MS - nowMs) / 1000);
      await conn.rollback();
      return {
        ok: false,
        reason: "daily_limit",
        retryAfterSec: Math.max(retryAfterSec, 1)
      };
    }

    const nextUsed = used + 1;
    const nextCooldownUntil = nowMs + cooldownMs;

    await conn.query(
      `UPDATE user_download_usage
       SET day_start_ms = ?, daily_count = ?, daily_limit = ?, cooldown_until_ms = ?, updated_at_ms = ?
       WHERE user_id = ?`,
      [normalized.day_start_ms, nextUsed, dailyLimit, nextCooldownUntil, nowMs, userId]
    );
    await conn.commit();

    return {
      ok: true,
      downloadsUsedToday: nextUsed,
      downloadsRemaining: Math.max(dailyLimit - nextUsed, 0),
      cooldownSec: Math.ceil(cooldownMs / 1000),
      dayResetAt: Number(normalized.day_start_ms) + DAY_MS
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

export async function getAdminUsageRows() {
  const pool = await getMySqlPool();
  const nowMs = Date.now();
  const [rows] = await pool.query(
    `SELECT user_id, day_start_ms, daily_count, daily_limit, cooldown_until_ms
     FROM user_download_usage
     ORDER BY daily_count DESC, updated_at_ms DESC`
  );

  return rows.map((row) => {
    const dailyLimit = Number(row.daily_limit) || 50;
    const used = Number(row.daily_count) || 0;
    const cooldownUntilMs = Number(row.cooldown_until_ms) || 0;
    const dayStartMs = Number(row.day_start_ms) || getUtcDayStartMs(nowMs);
    return {
      userId: row.user_id,
      tier: dailyLimit === 500 ? "premium" : "standard",
      dailyLimit,
      downloadsUsedToday: used,
      downloadsRemaining: Math.max(dailyLimit - used, 0),
      cooldownSec: cooldownUntilMs > nowMs ? Math.ceil((cooldownUntilMs - nowMs) / 1000) : 0,
      dayResetAt: dayStartMs + DAY_MS
    };
  });
}
