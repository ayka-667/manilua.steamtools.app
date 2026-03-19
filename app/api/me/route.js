import { auth } from "../../../auth";
import { checkGuildMembership, checkPremiumRole } from "../../../lib/discord-role";
import { getRateLimitState } from "../../../lib/rate-limit";

const DAY_MS = 86_400_000;

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
  const isPremiumUser = premium.allowed;
  const dailyLimit = isPremiumUser ? 500 : 50;
  const cooldownMs = isPremiumUser ? 10_000 : 5_000;

  const downloadQuota = userId
    ? getRateLimitState({
        key: `downloads:day:${userId}`,
        limit: dailyLimit,
        windowMs: DAY_MS
      })
    : { remaining: 0 };

  const downloadCooldown = userId
    ? getRateLimitState({
        key: `downloads:cooldown:${userId}`,
        limit: 1,
        windowMs: cooldownMs
      })
    : { retryAfterSec: 0 };

  return json({
    user: {
      id: userId,
      name: session.user.name || "Discord User",
      image: session.user.image || "",
      tag: session.user.tag || ""
    },
    inGuild: membership.allowed,
    guildReason: membership.reason,
    premium: premium.allowed,
    premiumReason: premium.reason,
    usage: {
      tier: isPremiumUser ? "premium" : "standard",
      dailyLimit,
      downloadsRemaining: downloadQuota.remaining,
      cooldownSec: downloadCooldown.retryAfterSec
    }
  });
}
