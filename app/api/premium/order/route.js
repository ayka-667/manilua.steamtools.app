import { auth } from "../../../../auth";
import { logField, sendDiscordLog } from "../../../../lib/discord-logs";
import { createPremiumOrder, getLatestOrderForUser, getPendingOrderForUser } from "../../../../lib/premium-store";

const ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID || "";
const ALLOWED_METHODS = new Set(["paypal", "card", "steam"]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function cleanCode(value) {
  return String(value || "").trim().slice(0, 128);
}

export async function POST(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return json({ error: "Unauthorized." }, 401);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const method = String(payload?.method || "").toLowerCase();
  if (!ALLOWED_METHODS.has(method)) {
    return json({ error: "Invalid payment method." }, 400);
  }

  const steamCode = method === "steam" ? cleanCode(payload?.steamCode) : "";
  if (method === "steam" && steamCode.length < 5) {
    return json({ error: "Steam Wallet code required." }, 400);
  }

  const pending = await getPendingOrderForUser(session.user.id);
  if (pending) {
    return json({ error: "You already have a pending order. Please wait for admin approval." }, 409);
  }

  const latest = await getLatestOrderForUser(session.user.id);
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  if (latest && Date.now() - Number(latest.created_at_ms || 0) < TWO_HOURS_MS) {
    return json({ error: "Please wait 2 hours before creating another order." }, 429);
  }

  const order = await createPremiumOrder({
    userId: session.user.id,
    method,
    steamCode,
    paymentNote: ""
  });

  await sendDiscordLog({
    title: "New premium order",
    level: "info",
    mentionRoleId: ADMIN_ROLE_ID,
    session,
    fields: [
      logField("Order ID", String(order.id), true),
      logField("Method", method, true),
      logField("Amount", order.price.formatted, true),
      ...(steamCode ? [logField("Steam code", steamCode, false)] : [])
    ]
  });

  return json({
    ok: true,
    orderId: order.id,
    price: order.price
  });
}
