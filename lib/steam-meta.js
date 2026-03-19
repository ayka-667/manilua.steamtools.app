const metaCache = new Map();

function cacheGet(appid) {
  const item = metaCache.get(appid);
  if (!item) return null;
  if (item.expiresAt <= Date.now()) {
    metaCache.delete(appid);
    return null;
  }
  return item.value;
}

function cacheSet(appid, value) {
  metaCache.set(appid, {
    value,
    expiresAt: Date.now() + 10 * 60 * 1000
  });
}

export function getHeaderImageUrl(appid) {
  return `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`;
}

export async function getSteamGameMeta(appid) {
  const safeAppid = String(appid || "").trim();
  if (!/^\d{1,10}$/.test(safeAppid)) {
    return { name: "Unknown game", image: "" };
  }

  const fromCache = cacheGet(safeAppid);
  if (fromCache) return fromCache;

  const fallback = {
    name: `App ${safeAppid}`,
    image: getHeaderImageUrl(safeAppid)
  };

  const url = new URL("https://store.steampowered.com/api/appdetails");
  url.searchParams.set("appids", safeAppid);
  url.searchParams.set("l", "english");

  try {
    const response = await fetch(url.toString(), { method: "GET", cache: "no-store" });
    if (!response.ok) {
      cacheSet(safeAppid, fallback);
      return fallback;
    }
    const data = await response.json().catch(() => null);
    const result = data?.[safeAppid];
    const meta = {
      name: result?.success && result?.data?.name ? result.data.name : fallback.name,
      image: result?.success && result?.data?.header_image ? result.data.header_image : fallback.image
    };
    cacheSet(safeAppid, meta);
    return meta;
  } catch {
    cacheSet(safeAppid, fallback);
    return fallback;
  }
}
