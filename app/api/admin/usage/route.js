import { auth } from "../../../../auth";
import { checkGuildRole } from "../../../../lib/discord-role";
import { getAdminUsageRows } from "../../../../lib/usage-store";
import { getAdminStats } from "../../../../lib/stats-store";

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

export async function GET() {
  const session = await auth();
  const requesterId = session?.user?.id || "";
  if (!requesterId) {
    return json({ error: "Unauthorized." }, 401);
  }

  const adminCheck = await checkGuildRole(requesterId, ADMIN_ROLE_ID, "Admin role required.");
  if (!adminCheck.allowed) {
    return json({ error: adminCheck.reason || "Forbidden." }, 403);
  }

  const rows = await getAdminUsageRows();
  const stats = await getAdminStats();

  rows.sort((a, b) => b.downloadsUsedToday - a.downloadsUsedToday);

  return json({
    admin: {
      userId: requesterId,
      roleId: ADMIN_ROLE_ID
    },
    totals: {
      trackedUsers: rows.length,
      premiumUsers: rows.filter((row) => row.tier === "premium").length,
      standardUsers: rows.filter((row) => row.tier === "standard").length
    },
    rows,
    stats
  });
}
