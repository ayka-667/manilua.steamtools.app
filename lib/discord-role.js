const roleCache = new Map();

function getCacheKey(guildId, roleId, userId) {
  return `${guildId}:${roleId}:${userId}`;
}

export async function checkPremiumRole(userId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const roleId = process.env.DISCORD_PREMIUM_ROLE_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!guildId || !roleId || !botToken || !userId) {
    return { allowed: false, reason: "Premium role service misconfigured." };
  }

  const key = getCacheKey(guildId, roleId, userId);
  const now = Date.now();
  const cached = roleCache.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`;
  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bot ${botToken}`
      },
      cache: "no-store"
    });
  } catch {
    return { allowed: false, reason: "Discord verification unavailable." };
  }

  if (!response.ok) {
    if (response.status === 404) {
      return { allowed: false, reason: "Join the Discord server first." };
    }
    return { allowed: false, reason: "Discord verification failed." };
  }

  const member = await response.json().catch(() => null);
  const roles = Array.isArray(member?.roles) ? member.roles : [];
  const hasRole = roles.includes(roleId);

  const value = hasRole
    ? { allowed: true, reason: "" }
    : { allowed: false, reason: "Premium role required. Buy the premium role on Discord." };

  roleCache.set(key, {
    value,
    expiresAt: now + 30_000
  });

  return value;
}
