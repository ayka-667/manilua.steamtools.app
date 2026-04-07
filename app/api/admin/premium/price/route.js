import { auth } from "../../../../../auth";
import { checkGuildRole } from "../../../../../lib/discord-role";
import { getPremiumConfig, setPremiumPrice } from "../../../../../lib/premium-store";

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
  return { ok: true };
}

export async function GET() {
  const session = await auth();
  const admin = await requireAdmin(session);
  if (!admin.ok) return admin.response;

  const price = await getPremiumConfig();
  return json({ ok: true, price });
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

  const price = await setPremiumPrice(payload?.amount);
  return json({ ok: true, price });
}
