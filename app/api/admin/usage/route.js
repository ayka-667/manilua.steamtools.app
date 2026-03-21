import { auth } from "../../../../auth";
import { checkGuildRole, checkPremiumRole } from "../../../../lib/discord-role";
import { getAdminDownloadUsageSnapshot } from "../../../../lib/rate-limit";

const ADMIN_ROLE_ID = "1363231330732867665";

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

  const snapshot = getAdminDownloadUsageSnapshot();
  const rows = await Promise.all(
    snapshot.map(async (entry) => {
      const premium = await checkPremiumRole(entry.userId);
      const isPremium = premium.allowed;
      const dailyLimit = isPremium ? 500 : 50;
      return {
        userId: entry.userId,
        tier: isPremium ? "premium" : "standard",
        dailyLimit,
        downloadsUsedToday: entry.downloadsUsedToday,
        downloadsRemaining: Math.max(dailyLimit - entry.downloadsUsedToday, 0),
        cooldownSec: entry.cooldownSec,
        dayResetAt: entry.dayResetAt
      };
    })
  );

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
    rows
  });
}
