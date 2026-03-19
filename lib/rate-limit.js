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
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: Math.ceil(windowMs / 1000) };
  }

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
