import { auth } from "../../../../../auth";
import { checkGuildRole } from "../../../../../lib/discord-role";
import { logField, sendDiscordLog } from "../../../../../lib/discord-logs";
import {
  getPremiumOrderById,
  getPremiumOrders,
  setCooldownResetAt,
  updatePremiumOrderStatus
} from "../../../../../lib/premium-store";

const ADMIN_ROLE_ID = process.env.DISCORD_ADMIN_ROLE_ID || "";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

async function requireAdmin(session) {
  const userId = session?.user?.id || "";
  if (!userId) {
    return { ok: false, response: json({ error: "Unauthorized." }, 401) };
  }
  const adminCheck = await checkGuildRole(userId, ADMIN_ROLE_ID, "Admin role required.");
  if (!adminCheck.allowed) {
    return { ok: false, response: json({ error: adminCheck.reason || "Forbidden." }, 403) };
  }
  return { ok: true, userId };
}

export async function GET(request) {
  const session = await auth();
  const admin = await requireAdmin(session);
  if (!admin.ok) return admin.response;

  const url = new URL(request.url);
  const status = url.searchParams.get("status") || "pending";
  const orders = await getPremiumOrders(status);
  return json({ ok: true, orders });
}

export async function POST(request) {
  const session = await auth();
  const admin = await requireAdmin(session);
  if (!admin.ok) return admin.response;

  let payload;
  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  const orderId = Number(payload?.id || 0);
  const action = String(payload?.action || "").toLowerCase();
  const note = String(payload?.note || "").trim().slice(0, 255);

  if (!orderId || !["approve", "reject", "reset_cooldown"].includes(action)) {
    return json({ error: "Invalid request." }, 400);
  }

  const order = await getPremiumOrderById(orderId);
  if (!order) {
    return json({ error: "Order not found." }, 404);
  }

  if (action === "reject") {
    await updatePremiumOrderStatus({
      id: orderId,
      status: "rejected",
      adminId: admin.userId,
      note
    });

    await sendDiscordLog({
      title: "Premium order rejected",
      level: "warning",
      session,
      fields: [
        logField("Order ID", String(orderId), true),
        logField("User ID", order.user_id, true),
        logField("Note", note || "n/a", false)
      ]
    });

    return json({ ok: true });
  }

  if (action === "reset_cooldown") {
    await setCooldownResetAt(order.user_id);
    return json({ ok: true });
  }

  const status = "approved";
  await updatePremiumOrderStatus({
    id: orderId,
    status,
    adminId: admin.userId,
    note
  });

  await sendDiscordLog({
    title: "Premium order approved",
    level: "success",
    session,
    fields: [
      logField("Order ID", String(orderId), true),
      logField("User ID", order.user_id, true)
    ]
  });

  return json({ ok: true, status });
}
