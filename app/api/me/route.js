import { auth } from "../../../auth";
import { checkGuildMembership, checkGuildRole, checkPremiumRole } from "../../../lib/discord-role";
import { getUsageForUser } from "../../../lib/usage-store";
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
  if (!session?.user) {
    return json({ error: "Unauthorized." }, 401);
  }

  const userId = session.user.id || "";
  const membership = userId
    ? await checkGuildMembership(userId)
    : { allowed: false, reason: "Missing Discord user ID in session. Please reconnect." };

  const premium = userId
    ? await checkPremiumRole(userId)
    : { allowed: false, reason: "Missing Discord user ID in session. Please reconnect." };
  const admin = userId
    ? await checkGuildRole(userId, ADMIN_ROLE_ID, "Admin role required.")
    : { allowed: false, reason: "Missing Discord user ID in session. Please reconnect." };
  const isPremiumUser = premium.allowed;
  const dailyLimit = isPremiumUser ? 500 : 50;
  const cooldownMs = isPremiumUser ? 2_000 : 10_000;

  const downloadQuota = userId
    ? await getUsageForUser(userId, dailyLimit, cooldownMs)
    : { downloadsRemaining: 0, cooldownSec: 0 };

  return json({
    user: {
      id: userId,
      name: session.user.name || "Discord User",
      image: session.user.image || "",
      tag: session.user.tag || ""
    },
    inGuild: membership.allowed,
    guildReason: membership.reason,
    isAdmin: admin.allowed,
    premium: premium.allowed,
    premiumReason: premium.reason,
    usage: {
      tier: isPremiumUser ? "premium" : "standard",
      dailyLimit,
      downloadsRemaining: downloadQuota.downloadsRemaining,
      cooldownSec: downloadQuota.cooldownSec
    }
  });
}
