import { getMySqlPool } from "./mysql";

const DEFAULT_PRICE_EUR = 4.99;

function parsePrice(value) {
  const parsed = Number.parseFloat(String(value || "").replace(",", "."));
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_PRICE_EUR;
  return Math.round(parsed * 100) / 100;
}

async function ensureSetting(pool, key, value) {
  const now = Date.now();
  await pool.query(
    `INSERT IGNORE INTO app_settings (setting_key, setting_value, updated_at_ms)
     VALUES (?, ?, ?)`,
    [key, String(value), now]
  );
}

export async function getPremiumConfig() {
  const pool = await getMySqlPool();
  await ensureSetting(pool, "premium_price_eur", DEFAULT_PRICE_EUR);

  const [rows] = await pool.query(
    "SELECT setting_value FROM app_settings WHERE setting_key = ?",
    ["premium_price_eur"]
  );
  const price = parsePrice(rows?.[0]?.setting_value);
  return {
    amount: price,
    currency: "EUR",
    formatted: `${price.toFixed(2)}€`
  };
}

export async function setPremiumPrice(nextPrice) {
  const pool = await getMySqlPool();
  const safePrice = parsePrice(nextPrice);
  const now = Date.now();
  await pool.query(
    `INSERT INTO app_settings (setting_key, setting_value, updated_at_ms)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_at_ms = VALUES(updated_at_ms)`,
    ["premium_price_eur", String(safePrice), now]
  );
  return {
    amount: safePrice,
    currency: "EUR",
    formatted: `${safePrice.toFixed(2)}€`
  };
}

export async function createPremiumOrder({
  userId,
  method,
  steamCode = "",
  paymentNote = ""
}) {
  const pool = await getMySqlPool();
  const price = await getPremiumConfig();
  const now = Date.now();
  const [result] = await pool.query(
    `INSERT INTO premium_orders
      (user_id, method, amount_cents, currency, status, steam_code, payment_note, created_at_ms, updated_at_ms)
     VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
    [
      userId,
      method,
      Math.round(price.amount * 100),
      price.currency,
      steamCode || null,
      paymentNote || null,
      now,
      now
    ]
  );

  return {
    id: Number(result?.insertId || 0),
    price
  };
}

export async function getPremiumOrders(status = "pending") {
  const pool = await getMySqlPool();
  let query = `SELECT id, user_id, method, amount_cents, currency, status, steam_code, payment_note,
                      created_at_ms, updated_at_ms, approved_by, approved_at_ms, rejected_by, rejected_at_ms, reject_reason
               FROM premium_orders`;
  const params = [];
  if (status && status !== "all") {
    query += " WHERE status = ?";
    params.push(status);
  }
  query += " ORDER BY created_at_ms DESC";
  const [rows] = await pool.query(query, params);
  return rows || [];
}

export async function getPremiumOrderById(orderId) {
  const pool = await getMySqlPool();
  const [rows] = await pool.query(
    `SELECT id, user_id, method, amount_cents, currency, status, steam_code, payment_note,
            created_at_ms, updated_at_ms, approved_by, approved_at_ms, rejected_by, rejected_at_ms, reject_reason
     FROM premium_orders
     WHERE id = ?
     LIMIT 1`,
    [orderId]
  );
  return rows?.[0] || null;
}

export async function getPendingOrderForUser(userId) {
  const pool = await getMySqlPool();
  const [rows] = await pool.query(
    `SELECT id, created_at_ms
     FROM premium_orders
     WHERE user_id = ? AND status = 'pending'
     ORDER BY created_at_ms DESC
     LIMIT 1`,
    [userId]
  );
  return rows?.[0] || null;
}

export async function getLatestOrderForUser(userId) {
  const pool = await getMySqlPool();
  const [rows] = await pool.query(
    `SELECT id, created_at_ms, status
     FROM premium_orders
     WHERE user_id = ?
     ORDER BY created_at_ms DESC
     LIMIT 1`,
    [userId]
  );
  return rows?.[0] || null;
}

export async function updatePremiumOrderStatus({
  id,
  status,
  adminId,
  note = ""
}) {
  const pool = await getMySqlPool();
  const now = Date.now();
  if (status === "approved") {
    await pool.query(
      `UPDATE premium_orders
       SET status = ?, approved_by = ?, approved_at_ms = ?, updated_at_ms = ?, payment_note = ?
       WHERE id = ?`,
      [status, adminId || null, now, now, note || null, id]
    );
    return;
  }

  if (status === "rejected") {
    await pool.query(
      `UPDATE premium_orders
       SET status = ?, rejected_by = ?, rejected_at_ms = ?, updated_at_ms = ?, reject_reason = ?
       WHERE id = ?`,
      [status, adminId || null, now, now, note || null, id]
    );
    return;
  }

  await pool.query(
    `UPDATE premium_orders SET status = ?, updated_at_ms = ? WHERE id = ?`,
    [status, now, id]
  );
}
