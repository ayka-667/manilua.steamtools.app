async function fetchGuildMember(guildId, botToken, userId) {
  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${userId}`;
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bot ${botToken}`
      },
      cache: "no-store"
    });

    if (!response.ok) {
      return { ok: false, status: response.status, member: null };
    }

    const member = await response.json().catch(() => null);
    return { ok: true, status: response.status, member };
  } catch {
    return { ok: false, status: 0, member: null };
  }
}

export async function checkGuildMembership(userId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!guildId || !botToken || !userId) {
    return { allowed: false, reason: "Discord membership service misconfigured.", member: null };
  }

  const result = await fetchGuildMember(guildId, botToken, userId);
  if (!result.ok) {
    if (result.status === 404) {
      return { allowed: false, reason: "Join the Discord server first.", member: null };
    }
    return { allowed: false, reason: "Discord verification failed.", member: null };
  }

  return { allowed: true, reason: "", member: result.member };
}

export async function checkPremiumRole(userId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const roleId = process.env.DISCORD_PREMIUM_ROLE_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!guildId || !roleId || !botToken || !userId) {
    return { allowed: false, reason: "Premium role service misconfigured." };
  }

  const membership = await checkGuildMembership(userId);
  if (!membership.allowed) {
    return { allowed: false, reason: membership.reason };
  }

  const member = membership.member;
  const roles = Array.isArray(member?.roles) ? member.roles : [];
  const hasRole = roles.includes(roleId);

  return hasRole
    ? { allowed: true, reason: "" }
    : { allowed: false, reason: "Premium role required. Buy the premium role on Discord." };
}

export async function checkGuildRole(userId, roleId, missingRoleReason = "Required role missing.") {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!guildId || !botToken || !userId || !roleId) {
    return { allowed: false, reason: "Discord role service misconfigured." };
  }

  const membership = await checkGuildMembership(userId);
  if (!membership.allowed) {
    return { allowed: false, reason: membership.reason };
  }

  const member = membership.member;
  const roles = Array.isArray(member?.roles) ? member.roles : [];
  const hasRole = roles.includes(roleId);
  return hasRole ? { allowed: true, reason: "" } : { allowed: false, reason: missingRoleReason };
}
