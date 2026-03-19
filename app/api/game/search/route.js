import { auth } from "../../../../auth";
import { applyRateLimit } from "../../../../lib/rate-limit";

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

export async function GET(request) {
  const session = await auth();
  if (!session?.user?.id) {
    return json({ error: "Unauthorized. Discord login required." }, 401);
  }

  const q = request.nextUrl.searchParams.get("q")?.trim() || "";
  if (q.length < 2) {
    return json({ error: "Query must contain at least 2 characters." }, 400);
  }

  const clientIp = getClientIp(request);
  const rate = applyRateLimit({
    key: `${clientIp}:game-search`,
    limit: 20,
    windowMs: 60_000
  });

  if (!rate.allowed) {
    return json({ error: `Rate limit reached. Retry in ${rate.retryAfterSec}s.` }, 429);
  }

  const url = new URL("https://store.steampowered.com/api/storesearch");
  url.searchParams.set("term", q);
  url.searchParams.set("l", "english");
  url.searchParams.set("cc", "us");

  let upstream;
  try {
    upstream = await fetch(url.toString(), { method: "GET", cache: "no-store" });
  } catch {
    return json({ error: "Steam search service unreachable." }, 502);
  }

  if (!upstream.ok) {
    return json({ error: `Steam search service error (${upstream.status}).` }, 502);
  }

  const data = await upstream.json().catch(() => null);
  const items = Array.isArray(data?.items) ? data.items : [];
  const first = items[0];

  if (!first?.id) {
    return json({ error: "No matching game found." }, 404);
  }

  return json({
    appid: String(first.id),
    name: first.name || `App ${first.id}`,
    headerImage:
      first.tiny_image ||
      `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${first.id}/header.jpg`
  });
}
