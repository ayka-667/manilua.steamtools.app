const EMBED_COLORS = {
  success: 0x57f287,
  warning: 0xfee75c,
  error: 0xed4245,
  info: 0x5865f2
};

function shorten(text, max = 900) {
  const value = String(text ?? "");
  if (value.length <= max) return value;
  return `${value.slice(0, max - 3)}...`;
}

export function logField(name, value, inline = true) {
  return {
    name: shorten(name, 256),
    value: shorten(value || "n/a", 1024),
    inline
  };
}

export function userLabel(session) {
  const id = session?.user?.id || "unknown";
  const name = session?.user?.name || "unknown";
  const tag = session?.user?.tag ? ` (${session.user.tag})` : "";
  return `${name}${tag} [${id}]`;
}

export async function sendDiscordLog({
  title,
  level = "info",
  description = "",
  fields = [],
  session = null,
  userId = "",
  mentionUser = false,
  imageUrl = ""
}) {
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const channelId = process.env.DISCORD_LOG_CHANNEL_ID || "1484254093827375206";
  if (!botToken || !channelId) return;

  const resolvedUserId = String(userId || session?.user?.id || "").trim();
  const mention = mentionUser && resolvedUserId ? `<@${resolvedUserId}>` : "";
  const allowedMentions = mention ? { users: [resolvedUserId] } : { parse: [] };

  const baseFields = [];
  if (session?.user) {
    baseFields.push(logField("User", userLabel(session), false));
  } else if (resolvedUserId) {
    baseFields.push(logField("User ID", resolvedUserId, false));
  }

  const embed = {
    title: shorten(title || "SteamTools event", 256),
    description: shorten(description || "", 2048),
    color: EMBED_COLORS[level] || EMBED_COLORS.info,
    fields: [...baseFields, ...fields].slice(0, 25),
    timestamp: new Date().toISOString(),
    footer: { text: "manilua.steamtools.app logs" }
  };
  if (imageUrl) {
    embed.image = { url: imageUrl };
  }

  try {
    await fetch(`https://discord.com/api/v10/channels/${channelId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        content: mention || undefined,
        allowed_mentions: allowedMentions,
        embeds: [embed]
      }),
      cache: "no-store"
    });
  } catch {
    // Best effort logging only.
  }
}
