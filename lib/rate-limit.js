const buckets = new Map();

function cleanupExpired(now) {
  for (const [key, value] of buckets.entries()) {
    if (value.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

export function applyRateLimit({ key, limit, windowMs }) {
  const now = Date.now();

  if (Math.random() < 0.02) {
    cleanupExpired(now);
  }

  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs, limit });
    return { allowed: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

  current.limit = limit;
  current.count += 1;

  if (current.count > limit) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterSec: Math.ceil((current.resetAt - now) / 1000)
    };
  }

  return {
    allowed: true,
    remaining: Math.max(limit - current.count, 0),
    retryAfterSec: Math.ceil((current.resetAt - now) / 1000)
  };
}

export function getRateLimitState({ key, limit, windowMs }) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    return {
      used: 0,
      remaining: limit,
      retryAfterSec: 0,
      resetAt: now + windowMs
    };
  }

  const effectiveLimit = typeof current.limit === "number" ? current.limit : limit;
  const used = Math.max(current.count, 0);
  return {
    used,
    remaining: Math.max(effectiveLimit - used, 0),
    retryAfterSec: Math.max(Math.ceil((current.resetAt - now) / 1000), 0),
    resetAt: current.resetAt
  };
}

export function getAdminDownloadUsageSnapshot() {
  const now = Date.now();
  cleanupExpired(now);

  const perUser = new Map();

  for (const [key, value] of buckets.entries()) {
    const dayMatch = key.match(/^downloads:day:(.+)$/);
    if (dayMatch) {
      const userId = dayMatch[1];
      const entry = perUser.get(userId) || {};
      entry.dayCount = Math.max(value.count, 0);
      entry.dayResetAt = value.resetAt;
      entry.dayLimit = typeof value.limit === "number" ? value.limit : null;
      perUser.set(userId, entry);
      continue;
    }

    const cooldownMatch = key.match(/^downloads:cooldown:(.+)$/);
    if (cooldownMatch) {
      const userId = cooldownMatch[1];
      const entry = perUser.get(userId) || {};
      entry.cooldownResetAt = value.resetAt;
      perUser.set(userId, entry);
    }
  }

  return Array.from(perUser.entries()).map(([userId, info]) => ({
    userId,
    downloadsUsedToday: info.dayCount || 0,
    dailyLimit: info.dayLimit || 50,
    dayResetAt: info.dayResetAt || null,
    cooldownSec:
      info.cooldownResetAt && info.cooldownResetAt > now
        ? Math.ceil((info.cooldownResetAt - now) / 1000)
        : 0
  }));
}
