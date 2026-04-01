import { applyRateLimit } from "../../../../lib/rate-limit";
import { auth } from "../../../../auth";
import { checkGuildMembership, checkPremiumRole } from "../../../../lib/discord-role";
import { logField, sendDiscordLog } from "../../../../lib/discord-logs";
import { getHeaderImageUrl, getSteamGameMeta } from "../../../../lib/steam-meta";
import { consumeDownloadQuota, getUsageForUser } from "../../../../lib/usage-store";
import { recordDownloadEvent } from "../../../../lib/stats-store";

const PROVIDER_MAP = {
  ryuu: {
    label: "Ryuu",
    baseUrl: "https://generator.ryuu.lol",
    apiKeyEnv: "RYUU_API_KEY",
    endpoints: {
      downloadManifest: "secure_download",
      downloadRandomManifest: "secure_download",
      downloadLua: "resellerlua",
      requestUpdate: "resellerrequestupdate",
      requestGame: "resellerrequest",
      updateGame: "resellerupdate"
    }
  },
  depotbox: {
    label: "DepotBox",
    baseUrl: process.env.DEPOTBOX_BASE_URL || "https://depotbox.org",
    apiKeyEnv: "DEPOTBOX_API_KEY",
    endpoints: {
      downloadManifest: "api/download",
      downloadRandomManifest: "api/download"
    }
  }
};

const DEFAULT_GAME_LIST_URL = "https://raw.githubusercontent.com/SteamTools-Team/GameList/refs/heads/main/games.json";
let manifestGameListCache = {
  expiresAt: 0,
  appids: []
};

const ACTION_MAP = {
  downloadManifest: { endpointKey: "downloadManifest", isDownload: true, label: "Download Manifest", requiresAppid: true },
  downloadRandomManifest: { endpointKey: "downloadRandomManifest", isDownload: true, label: "Random Manifest", requiresAppid: false, randomManifest: true },
  downloadLua: { endpointKey: "downloadLua", isDownload: true, label: "Download Lua", requiresAppid: true },
  requestUpdate: { endpointKey: "requestUpdate", isDownload: false, label: "Request Update", requiresAppid: true },
  requestGame: { endpointKey: "requestGame", isDownload: false, label: "Request Game", requiresAppid: true },
  updateGame: { endpointKey: "updateGame", isDownload: false, label: "Update Game", requiresAppid: true }
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

function getUpstreamUserMessage(status) {
  if (status === 404) {
    return "Game not found or not released yet.";
  }
  return `Upstream error ${status}.`;
}

function getActionLabel(action) {
  return ACTION_MAP[action]?.label || action;
}

function getProvider(providerId) {
  const normalized = String(providerId || "ryuu").trim().toLowerCase();
  return PROVIDER_MAP[normalized] || null;
}

function getActionProvider(action, providerId) {
  if (!isManifestLikeAction(action)) {
    return PROVIDER_MAP.ryuu;
  }
  return getProvider(providerId);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchDepotBoxDownload(provider, apiKey, appid) {
  const startUrl = new URL(provider.endpoints.downloadManifest, provider.baseUrl).toString();
  const startResponse = await fetch(startUrl, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey
    },
    body: JSON.stringify({ appid })
  });

  if (!startResponse.ok) {
    const failText = await startResponse.text().catch(() => "");
    return {
      ok: false,
      status: startResponse.status,
      detail: failText
    };
  }

  const startPayload = await startResponse.json().catch(() => null);
  const token = String(startPayload?.token || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 502,
      detail: "DepotBox did not return a download token."
    };
  }

  const statusUrl = new URL(`api/status/${token}`, provider.baseUrl).toString();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    if (attempt > 0) {
      await sleep(1500);
    }

    const statusResponse = await fetch(statusUrl, {
      method: "GET",
      cache: "no-store",
      headers: {
        "x-api-key": apiKey
      }
    });

    if (!statusResponse.ok) {
      const failText = await statusResponse.text().catch(() => "");
      return {
        ok: false,
        status: statusResponse.status,
        detail: failText
      };
    }

    const statusPayload = await statusResponse.json().catch(() => null);
    const status = String(statusPayload?.status || "").toLowerCase();

    if (status === "completed" && statusPayload?.download_link) {
      const downloadResponse = await fetch(String(statusPayload.download_link), {
        method: "GET",
        cache: "no-store",
        headers: {
          "x-api-key": apiKey
        }
      });

      if (!downloadResponse.ok) {
        const failText = await downloadResponse.text().catch(() => "");
        return {
          ok: false,
          status: downloadResponse.status,
          detail: failText
        };
      }

      return {
        ok: true,
        response: downloadResponse
      };
    }

    if (status === "failed") {
      return {
        ok: false,
        status: 502,
        detail: String(statusPayload?.message || "DepotBox download failed.")
      };
    }
  }

  return {
    ok: false,
    status: 504,
    detail: "DepotBox download timed out while processing."
  };
}

async function getRandomManifestAppid() {
  const now = Date.now();
  if (manifestGameListCache.expiresAt > now && manifestGameListCache.appids.length > 0) {
    return manifestGameListCache.appids[Math.floor(Math.random() * manifestGameListCache.appids.length)];
  }

  const sourceUrl = process.env.MANIFEST_RANDOM_LIST_URL || DEFAULT_GAME_LIST_URL;
  const response = await fetch(sourceUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load manifest game list.");
  }

  const payload = await response.json();
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.value) ? payload.value : [];
  const appids = items
    .map((item) => String(item?.appid || "").trim())
    .filter((appid) => /^\d{1,10}$/.test(appid));

  if (appids.length === 0) {
    throw new Error("Manifest game list is empty.");
  }

  manifestGameListCache = {
    appids,
    expiresAt: now + 10 * 60_000
  };

  return appids[Math.floor(Math.random() * appids.length)];
}

function isManifestLikeAction(action) {
  return action === "downloadManifest" || action === "downloadRandomManifest";
}

function isSafeRedirectLocation(location) {
  if (!location) return false;
  try {
    const url = new URL(location);
    return !url.searchParams.has("auth_code");
  } catch {
    return false;
  }
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
  const actionLabel = getActionLabel(action);
  if (!config) {
    await sendDiscordLog({
      title: "Action blocked: unknown action",
      level: "warning",
      description: "Received an unsupported action ID.",
      session,
      mentionUser: true,
      fields: [logField("Action", actionLabel, false)]
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
      fields: [logField("Action", actionLabel), logField("Reason", membership.reason || "Join required", false)]
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
        fields: [logField("Action", actionLabel), logField("Reason", premium.reason || "Premium role required", false)]
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
        logField("Action", actionLabel),
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

  if (isManifestLikeAction(action) || action === "downloadLua") {
    const dailyLimit = isPremiumUser ? 500 : 50;
    const cooldownMs = isPremiumUser ? 2_000 : 10_000;
    const tier = isPremiumUser ? "premium" : "standard";
    const resourceName = action === "downloadLua" ? "Lua" : "manifest";
    const usage = await getUsageForUser(session.user.id, dailyLimit, cooldownMs);

    if (usage.cooldownSec > 0) {
      return json(
        { error: `Cooldown active. Retry in ${usage.cooldownSec}s.` },
        429,
        { "retry-after": String(usage.cooldownSec) }
      );
    }

    if (usage.downloadsRemaining <= 0) {
      await sendDiscordLog({
        title: `${resourceName} daily quota reached`,
        level: "warning",
        description: `User reached the daily ${resourceName.toLowerCase()} limit.`,
        session,
        mentionUser: true,
        fields: [
          logField("Action", actionLabel),
          logField("Tier", tier),
          logField("Limit", `${dailyLimit}/day`),
          logField("Retry", `${Math.max(Math.ceil((usage.dayResetAt - Date.now()) / 1000), 1)}s`)
        ]
      });
      const retryAfterSec = Math.max(Math.ceil((usage.dayResetAt - Date.now()) / 1000), 1);
      return json(
        { error: `Daily ${resourceName.toLowerCase()} limit reached (${dailyLimit}/day).` },
        429,
        { "retry-after": String(retryAfterSec) }
      );
    }
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
      fields: [logField("Action", actionLabel, false)]
    });
    return json({ error: "Invalid JSON body." }, 400);
  }

  const provider = getActionProvider(action, payload?.provider);
  if (!provider) {
    return json({ error: "Unsupported manifest provider." }, 400);
  }

  const apiKey = process.env[provider.apiKeyEnv || "RYUU_API_KEY"];
  if (!apiKey) {
    await sendDiscordLog({
      title: "Server misconfiguration",
      level: "error",
      description: "Missing required server environment variable.",
      session,
      fields: [logField("Missing env", provider.apiKeyEnv || "RYUU_API_KEY", false)]
    });
    return json({ error: `Server misconfiguration: missing ${provider.apiKeyEnv || "RYUU_API_KEY"}.` }, 500);
  }

  const resolvedAppid = config.randomManifest ? await getRandomManifestAppid() : String(payload?.appid || "").trim();
  if (config.requiresAppid && !/^\d{1,10}$/.test(resolvedAppid)) {
    await sendDiscordLog({
      title: "Action failed: invalid appid",
      level: "warning",
      description: "Received malformed or empty AppID.",
      session,
      mentionUser: true,
      fields: [logField("Action", actionLabel), logField("AppID", resolvedAppid || "empty")]
    });
    return json({ error: "appid must be numeric (1-10 digits)." }, 400);
  }

  const gameMeta = await getSteamGameMeta(resolvedAppid);
  const gameImage = gameMeta.image || getHeaderImageUrl(resolvedAppid);

  let upstream;
  try {
    if (provider.label === "DepotBox" && isManifestLikeAction(action)) {
      const depotBoxResult = await fetchDepotBoxDownload(provider, apiKey, resolvedAppid);
      if (!depotBoxResult.ok) {
        upstream = new Response(depotBoxResult.detail || "DepotBox request failed.", {
          status: depotBoxResult.status || 502
        });
      } else {
        upstream = depotBoxResult.response;
      }
    } else {
      const endpoint = provider.endpoints[config.endpointKey];
      const url = new URL(`${provider.baseUrl}/${endpoint}`);
      url.searchParams.set("appid", resolvedAppid);
      url.searchParams.set("auth_code", apiKey);

      upstream = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        redirect: config.isDownload ? "manual" : "follow"
      });
    }
  } catch {
    await sendDiscordLog({
      title: "Action failed: upstream unreachable",
      level: "error",
      description: `> Could not reach upstream API.\n> Game: **${gameMeta.name}**`,
      session,
      mentionUser: true,
      imageUrl: gameImage,
      fields: [logField("Action", actionLabel), logField("Provider", provider.label), logField("AppID", resolvedAppid), logField("Game", gameMeta.name)]
    });
    return json({ error: "Upstream service unreachable." }, 502);
  }

  if (config.isDownload && upstream.status >= 300 && upstream.status < 400) {
    const location = upstream.headers.get("location") || "";
    if (isSafeRedirectLocation(location)) {
      if (isManifestLikeAction(action) || action === "downloadLua") {
        const dailyLimit = isPremiumUser ? 500 : 50;
        const cooldownMs = isPremiumUser ? 2_000 : 10_000;
        const resourceName = action === "downloadLua" ? "Lua" : "manifest";
        const quota = await consumeDownloadQuota(session.user.id, dailyLimit, cooldownMs);
        if (!quota.ok) {
          if (quota.reason === "cooldown") {
            return json(
              { error: `Cooldown active. Retry in ${quota.retryAfterSec}s.` },
              429,
              { "retry-after": String(quota.retryAfterSec) }
            );
          }
          return json(
            { error: `Daily ${resourceName.toLowerCase()} limit reached (${dailyLimit}/day).` },
            429,
            { "retry-after": String(quota.retryAfterSec || 1) }
          );
        }
      }

      await recordDownloadEvent({
        userId: session.user.id,
        actionId: action === "downloadLua" ? "downloadLua" : "downloadManifest",
        appid: resolvedAppid,
        gameName: gameMeta.name,
        tier: isPremiumUser ? "premium" : "standard"
      });

      await sendDiscordLog({
        title: "Action success",
        level: "success",
        description: `> Download redirect prepared successfully.\n> Game: **${gameMeta.name}**`,
        session,
        mentionUser: true,
        imageUrl: gameImage,
        fields: [logField("Action", actionLabel), logField("Provider", provider.label), logField("AppID", resolvedAppid), logField("Game", gameMeta.name)]
      });

      return new Response(null, {
        status: 307,
        headers: {
          location,
          "cache-control": "no-store"
        }
      });
    }

    // If upstream redirect includes auth_code, do not expose it to clients.
    if (provider.label !== "DepotBox") {
      const endpoint = provider.endpoints[config.endpointKey];
      const url = new URL(`${provider.baseUrl}/${endpoint}`);
      url.searchParams.set("appid", resolvedAppid);
      url.searchParams.set("auth_code", apiKey);
      try {
        upstream = await fetch(url.toString(), {
          method: "GET",
          cache: "no-store",
          redirect: "follow"
        });
      } catch {
        return json({ error: "Upstream service unreachable." }, 502);
      }
    }
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
        logField("Action", actionLabel),
        logField("Provider", provider.label),
        logField("AppID", resolvedAppid),
        logField("Game", gameMeta.name),
        logField("HTTP status", String(upstream.status)),
        logField("Detail", failText || "No detail", false)
      ]
    });
    return json(
      {
        error: getUpstreamUserMessage(upstream.status),
        detail: failText.slice(0, 300)
      },
      502
    );
  }

  if (config.isDownload) {
    if (isManifestLikeAction(action) || action === "downloadLua") {
      const dailyLimit = isPremiumUser ? 500 : 50;
      const cooldownMs = isPremiumUser ? 2_000 : 10_000;
      const resourceName = action === "downloadLua" ? "Lua" : "manifest";
      const quota = await consumeDownloadQuota(session.user.id, dailyLimit, cooldownMs);
      if (!quota.ok) {
        if (quota.reason === "cooldown") {
          return json(
            { error: `Cooldown active. Retry in ${quota.retryAfterSec}s.` },
            429,
            { "retry-after": String(quota.retryAfterSec) }
          );
        }
        return json(
          { error: `Daily ${resourceName.toLowerCase()} limit reached (${dailyLimit}/day).` },
          429,
          { "retry-after": String(quota.retryAfterSec || 1) }
        );
      }
    }

      await recordDownloadEvent({
        userId: session.user.id,
        actionId: action === "downloadLua" ? "downloadLua" : "downloadManifest",
        appid: resolvedAppid,
        gameName: gameMeta.name,
        tier: isPremiumUser ? "premium" : "standard"
      });

    const filename = `${config.randomManifest ? "random-manifest" : action}-${resolvedAppid}`;
    await sendDiscordLog({
      title: "Action success",
      level: "success",
      description: `> Download prepared successfully.\n> Game: **${gameMeta.name}**`,
      session,
      mentionUser: true,
      imageUrl: gameImage,
      fields: [logField("Action", actionLabel), logField("Provider", provider.label), logField("AppID", resolvedAppid), logField("Game", gameMeta.name)]
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
        logField("Action", actionLabel),
        logField("Provider", provider.label),
        logField("AppID", resolvedAppid),
        logField("Game", gameMeta.name),
        logField("Result", message, false)
      ]
  });

  return json({
    success: true,
    action,
    appid: resolvedAppid,
    message,
    upstream: parsedUpstream
  });
}
