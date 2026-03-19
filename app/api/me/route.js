import { auth } from "../../../auth";
import { checkPremiumRole } from "../../../lib/discord-role";

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
  const premium = userId
    ? await checkPremiumRole(userId)
    : { allowed: false, reason: "Missing Discord user ID in session. Please reconnect." };

  return json({
    user: {
      id: userId,
      name: session.user.name || "Discord User",
      image: session.user.image || "",
      tag: session.user.tag || ""
    },
    premium: premium.allowed,
    premiumReason: premium.reason
  });
}
