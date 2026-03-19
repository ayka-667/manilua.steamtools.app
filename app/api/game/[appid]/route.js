import { applyRateLimit } from "../../../../lib/rate-limit";
import { auth } from "../../../../auth";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function getClientIp(request) {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

export async function GET(request, context) {
  const session = await auth();
  if (!session?.user?.id) {
    return json({ error: "Unauthorized. Discord login required." }, 401);
  }

  const { appid } = await context.params;
  const normalizedAppid = String(appid || "").trim();

  if (!/^\d{1,10}$/.test(normalizedAppid)) {
    return json({ error: "appid must be numeric (1-10 digits)." }, 400);
  }

  const clientIp = getClientIp(request);
  const rate = applyRateLimit({
    key: `${clientIp}:gameinfo`,
    limit: 24,
    windowMs: 60_000
  });

  if (!rate.allowed) {
    return json({ error: `Rate limit reached. Retry in ${rate.retryAfterSec}s.` }, 429);
  }

  const url = new URL("https://store.steampowered.com/api/appdetails");
  url.searchParams.set("appids", normalizedAppid);
  url.searchParams.set("l", "english");

  let upstream;
  try {
    upstream = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  } catch {
    return json({ error: "Steam metadata service unreachable." }, 502);
  }

  if (!upstream.ok) {
    return json({ error: `Steam metadata service error (${upstream.status}).` }, 502);
  }

  let data;
  try {
    data = await upstream.json();
  } catch {
    return json({ error: "Invalid Steam metadata response." }, 502);
  }

  const result = data?.[normalizedAppid];
  if (!result?.success || !result?.data) {
    return json({ error: "Game not found for this AppID." }, 404);
  }

  return json({
    appid: normalizedAppid,
    name: result.data.name || `App ${normalizedAppid}`,
    headerImage:
      result.data.header_image ||
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${normalizedAppid}/header.jpg`,
    shortDescription: result.data.short_description || ""
  });
}
