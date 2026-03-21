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
