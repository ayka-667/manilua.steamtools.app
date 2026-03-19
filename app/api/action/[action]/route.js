import { applyRateLimit } from "../../../../lib/rate-limit";
import { auth } from "../../../../auth";
import { checkGuildMembership, checkPremiumRole } from "../../../../lib/discord-role";
import { logField, sendDiscordLog } from "../../../../lib/discord-logs";
import { getHeaderImageUrl, getSteamGameMeta } from "../../../../lib/steam-meta";

const API_BASE = "https://generator.ryuu.lol";
const DAY_MS = 86_400_000;

const ACTION_MAP = {
  downloadManifest: { endpoint: "secure_download", isDownload: true },
  downloadLua: { endpoint: "resellerlua", isDownload: true },
  requestUpdate: { endpoint: "resellerrequestupdate", isDownload: false },
  requestGame: { endpoint: "resellerrequest", isDownload: false },
  updateGame: { endpoint: "resellerupdate", isDownload: false }
};

function getClientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...extraHeaders
    }
  });
}

export async function POST(request, context) {
  const session = await auth();
  if (!session?.user?.id) {
    await sendDiscordLog({
      title: "Action blocked: unauthorized",
      level: "warning",
      description: "A request was blocked because the user was not authenticated.",
      fields: [logField("Reason", "Discord login required", false)]
    });
    return json({ error: "Unauthorized. Discord login required." }, 401);
  }

  const { action } = await context.params;
  const config = ACTION_MAP[action];
  if (!config) {
    await sendDiscordLog({
      title: "Action blocked: unknown action",
      level: "warning",
      description: "Received an unsupported action ID.",
      session,
      mentionUser: true,
      fields: [logField("Action", action, false)]
    });
    return json({ error: "Unknown action." }, 404);
  }

  const membership = await checkGuildMembership(session.user.id);
  if (!membership.allowed) {
    await sendDiscordLog({
      title: "Action blocked: not in Discord server",
      level: "warning",
      description: "User attempted an action while not being a server member.",
      session,
      mentionUser: true,
      fields: [logField("Action", action), logField("Reason", membership.reason || "Join required", false)]
    });
    return json({ error: membership.reason || "Join the Discord server first." }, 403);
  }

  const premium = await checkPremiumRole(session.user.id);
  const isPremiumUser = premium.allowed;

  if (action === "requestUpdate" || action === "updateGame") {
    if (!isPremiumUser) {
      await sendDiscordLog({
        title: "Premium action denied",
        level: "warning",
        description: "User attempted a premium-only action without the required role.",
        session,
        mentionUser: true,
        fields: [logField("Action", action), logField("Reason", premium.reason || "Premium role required", false)]
      });
      return json({ error: premium.reason || "Premium role required." }, 403);
    }
  }

  const clientIp = getClientIp(request);
  const rate = applyRateLimit({
    key: `${clientIp}:${action}`,
    limit: 12,
    windowMs: 60_000
  });

  if (!rate.allowed) {
    await sendDiscordLog({
      title: "Rate limit triggered",
      level: "warning",
      description: "User exceeded rate limit for this action.",
      session,
      mentionUser: true,
      fields: [
        logField("Action", action),
        logField("IP", clientIp),
        logField("Retry", `${rate.retryAfterSec}s`)
      ]
    });
    return json(
      {
        error: `Rate limit reached. Retry in ${rate.retryAfterSec}s.`
      },
      429,
      { "retry-after": String(rate.retryAfterSec) }
    );
  }

  if (action === "downloadManifest" || action === "downloadLua") {
    const dailyLimit = isPremiumUser ? 500 : 50;
    const cooldownMs = isPremiumUser ? 10_000 : 5_000;
    const tier = isPremiumUser ? "premium" : "standard";
    const resourceName = action === "downloadLua" ? "Lua" : "manifest";

    const dailyQuota = applyRateLimit({
      key: `downloads:day:${session.user.id}`,
      limit: dailyLimit,
      windowMs: DAY_MS
    });

    if (!dailyQuota.allowed) {
      await sendDiscordLog({
        title: `${resourceName} daily quota reached`,
        level: "warning",
        description: `User reached the daily ${resourceName.toLowerCase()} limit.`,
        session,
        mentionUser: true,
        fields: [
          logField("Action", action),
          logField("Tier", tier),
          logField("Limit", `${dailyLimit}/day`),
          logField("Retry", `${dailyQuota.retryAfterSec}s`)
        ]
      });
      return json(
        { error: `Daily ${resourceName.toLowerCase()} limit reached (${dailyLimit}/day).` },
        429,
        { "retry-after": String(dailyQuota.retryAfterSec) }
      );
    }

    const cooldown = applyRateLimit({
      key: `downloads:cooldown:${session.user.id}`,
      limit: 1,
      windowMs: cooldownMs
    });

    if (!cooldown.allowed) {
      return json(
        { error: `Cooldown active. Retry in ${cooldown.retryAfterSec}s.` },
        429,
        { "retry-after": String(cooldown.retryAfterSec) }
      );
    }
  }

  const apiKey = process.env.RYUU_API_KEY;
  if (!apiKey) {
    await sendDiscordLog({
      title: "Server misconfiguration",
      level: "error",
      description: "Missing required server environment variable.",
      session,
      fields: [logField("Missing env", "RYUU_API_KEY", false)]
    });
    return json({ error: "Server misconfiguration: missing API key." }, 500);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    await sendDiscordLog({
      title: "Action failed: invalid JSON body",
      level: "error",
      description: "Could not parse request body as JSON.",
      session,
      mentionUser: true,
      fields: [logField("Action", action, false)]
    });
    return json({ error: "Invalid JSON body." }, 400);
  }

  const rawAppid = String(payload?.appid || "").trim();
  if (!/^\d{1,10}$/.test(rawAppid)) {
    await sendDiscordLog({
      title: "Action failed: invalid appid",
      level: "warning",
      description: "Received malformed or empty AppID.",
      session,
      mentionUser: true,
      fields: [logField("Action", action), logField("AppID", rawAppid || "empty")]
    });
    return json({ error: "appid must be numeric (1-10 digits)." }, 400);
  }

  const gameMeta = await getSteamGameMeta(rawAppid);
  const gameImage = gameMeta.image || getHeaderImageUrl(rawAppid);

  const url = new URL(`${API_BASE}/${config.endpoint}`);
  url.searchParams.set("appid", rawAppid);
  url.searchParams.set("auth_code", apiKey);

  let upstream;
  try {
    upstream = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store"
    });
  } catch {
    await sendDiscordLog({
      title: "Action failed: upstream unreachable",
      level: "error",
      description: `> Could not reach upstream API.\n> Game: **${gameMeta.name}**`,
      session,
      mentionUser: true,
      imageUrl: gameImage,
      fields: [logField("Action", action), logField("AppID", rawAppid), logField("Game", gameMeta.name)]
    });
    return json({ error: "Upstream service unreachable." }, 502);
  }

  if (!upstream.ok) {
    const failText = await upstream.text().catch(() => "");
    await sendDiscordLog({
      title: "Action failed: upstream error",
      level: "error",
      description: `> Upstream API returned an error response.\n> Game: **${gameMeta.name}**`,
      session,
      mentionUser: true,
      imageUrl: gameImage,
      fields: [
        logField("Action", action),
        logField("AppID", rawAppid),
        logField("Game", gameMeta.name),
        logField("HTTP status", String(upstream.status)),
        logField("Detail", failText || "No detail", false)
      ]
    });
    return json(
      {
        error: `Upstream error ${upstream.status}.`,
        detail: failText.slice(0, 300)
      },
      502
    );
  }

  if (config.isDownload) {
    const filename = `${action}-${rawAppid}`;
    await sendDiscordLog({
      title: "Action success",
      level: "success",
      description: `> Download prepared successfully.\n> Game: **${gameMeta.name}**`,
      session,
      mentionUser: true,
      imageUrl: gameImage,
      fields: [logField("Action", action), logField("AppID", rawAppid), logField("Game", gameMeta.name)]
    });
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "content-type": upstream.headers.get("content-type") || "application/octet-stream",
        "content-disposition":
          upstream.headers.get("content-disposition") || `attachment; filename="${filename}"`,
        "cache-control": "no-store"
      }
    });
  }

  const text = await upstream.text().catch(() => "");
  let message = text || "Action successfully sent.";
  let parsedUpstream = null;

  if (text) {
    try {
      parsedUpstream = JSON.parse(text);
      if (typeof parsedUpstream?.message === "string" && parsedUpstream.message.trim()) {
        message = parsedUpstream.message.trim();
      } else if (typeof parsedUpstream?.error === "string" && parsedUpstream.error.trim()) {
        message = parsedUpstream.error.trim();
      }
    } catch {
      parsedUpstream = null;
    }
  }

  await sendDiscordLog({
    title: "Action success",
    level: "success",
    description: `> Request completed successfully.\n> Game: **${gameMeta.name}**`,
    session,
    mentionUser: true,
    imageUrl: gameImage,
    fields: [
      logField("Action", action),
      logField("AppID", rawAppid),
      logField("Game", gameMeta.name),
      logField("Result", message, false)
    ]
  });

  return json({
    success: true,
    action,
    appid: rawAppid,
    message,
    upstream: parsedUpstream
  });
}
