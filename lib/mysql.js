import mysql from "mysql2/promise";

let pool;
let initPromise;

function getPool() {
  if (pool) return pool;

  const host = process.env.MYSQL_HOST;
  const user = process.env.MYSQL_USER;
  const database = process.env.MYSQL_DATABASE;
  const password = process.env.MYSQL_PASSWORD || "";
  const port = Number(process.env.MYSQL_PORT || 3306);

  if (!host || !user || !database) {
    throw new Error("MySQL env missing. Required: MYSQL_HOST, MYSQL_USER, MYSQL_DATABASE.");
  }

  pool = mysql.createPool({
    host,
    port,
    user,
    password,
    database,
    connectionLimit: Number(process.env.MYSQL_CONNECTION_LIMIT || 10),
    waitForConnections: true,
    queueLimit: 0
  });

  return pool;
}

async function ensureSchema() {
  const p = getPool();
  await p.query(`
    CREATE TABLE IF NOT EXISTS user_download_usage (
      user_id VARCHAR(64) NOT NULL PRIMARY KEY,
      day_start_ms BIGINT NOT NULL,
      daily_count INT NOT NULL DEFAULT 0,
      daily_limit INT NOT NULL DEFAULT 50,
      cooldown_until_ms BIGINT NOT NULL DEFAULT 0,
      updated_at_ms BIGINT NOT NULL
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS download_events (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      action_id VARCHAR(64) NOT NULL,
      appid VARCHAR(32) NOT NULL,
      game_name VARCHAR(255) NOT NULL,
      tier VARCHAR(16) NOT NULL,
      created_at_ms BIGINT NOT NULL
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS scheduled_reports (
      report_key VARCHAR(96) NOT NULL PRIMARY KEY,
      report_type VARCHAR(32) NOT NULL,
      created_at_ms BIGINT NOT NULL
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(64) NOT NULL PRIMARY KEY,
      setting_value TEXT NOT NULL,
      updated_at_ms BIGINT NOT NULL
    )
  `);

  await p.query(`
    CREATE TABLE IF NOT EXISTS premium_orders (
      id BIGINT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      method VARCHAR(24) NOT NULL,
      amount_cents INT NOT NULL,
      currency VARCHAR(8) NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'pending',
      steam_code VARCHAR(128),
      payment_note VARCHAR(255),
      created_at_ms BIGINT NOT NULL,
      updated_at_ms BIGINT NOT NULL,
      approved_by VARCHAR(64),
      approved_at_ms BIGINT,
      rejected_by VARCHAR(64),
      rejected_at_ms BIGINT,
      reject_reason VARCHAR(255)
    )
  `);

  const [orderIndexes] = await p.query("SHOW INDEX FROM premium_orders");
  const orderIndexSet = new Set(orderIndexes.map((row) => row.Key_name));
  if (!orderIndexSet.has("idx_premium_orders_status")) {
    await p.query("CREATE INDEX idx_premium_orders_status ON premium_orders (status)");
  }
  if (!orderIndexSet.has("idx_premium_orders_created")) {
    await p.query("CREATE INDEX idx_premium_orders_created ON premium_orders (created_at_ms)");
  }

  const [existingIndexes] = await p.query("SHOW INDEX FROM download_events");
  const existing = new Set(existingIndexes.map((row) => row.Key_name));

  if (!existing.has("idx_download_events_created")) {
    await p.query("CREATE INDEX idx_download_events_created ON download_events (created_at_ms)");
  }
  if (!existing.has("idx_download_events_appid")) {
    await p.query("CREATE INDEX idx_download_events_appid ON download_events (appid)");
  }
  if (!existing.has("idx_download_events_user")) {
    await p.query("CREATE INDEX idx_download_events_user ON download_events (user_id)");
  }
}

export async function getMySqlPool() {
  const p = getPool();
  if (!initPromise) {
    initPromise = ensureSchema().catch((error) => {
      initPromise = null;
      throw error;
    });
  }
  await initPromise;
  return p;
}
