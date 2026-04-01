import NextAuth from "next-auth";
import Discord from "next-auth/providers/discord";
import { logField, sendDiscordLog } from "./lib/discord-logs";

async function tryAutoJoinGuild(discordUserId, userAccessToken) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!guildId || !botToken || !discordUserId || !userAccessToken) {
    return { attempted: false, ok: false, status: 0 };
  }

  const url = `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}`;
  try {
    const response = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        access_token: userAccessToken
      }),
      cache: "no-store"
    });
    return { attempted: true, ok: response.ok, status: response.status };
  } catch {
    return { attempted: true, ok: false, status: 0 };
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET,
  providers: [
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID || process.env.AUTH_DISCORD_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET || process.env.AUTH_DISCORD_SECRET,
      authorization: {
        params: {
          scope: "identify email guilds.join"
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async signIn({ account, user, profile }) {
      if (account?.provider === "discord") {
        const joinResult = await tryAutoJoinGuild(account.providerAccountId, account.access_token);
        const displayName = profile?.username || user?.name || "Discord User";
        const tag =
          profile?.username && profile?.discriminator && profile.discriminator !== "0"
            ? `${profile.username}#${profile.discriminator}`
            : displayName;
        await sendDiscordLog({
          title: "User logged in",
          level: "info",
          description: "Discord OAuth login completed.",
          userId: account.providerAccountId,
          mentionUser: true,
          fields: [
            logField("User", `${displayName} (${tag}) [${account.providerAccountId}]`, false),
            logField("Auto-join", joinResult.attempted ? (joinResult.ok ? "success" : "failed") : "not attempted"),
            logField("Join status", joinResult.status || "n/a")
          ]
        });
      }
      return true;
    },
    async jwt({ token, account, profile }) {
      if (account?.provider === "discord") {
        token.discordUserId = account.providerAccountId || token.sub || null;
      }
      if (profile?.username && profile?.discriminator) {
        token.discordTag = `${profile.username}${
          profile.discriminator === "0" ? "" : `#${profile.discriminator}`
        }`;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.discordUserId || token.sub || null;
        session.user.tag = token.discordTag || null;
      }
      return session;
    }
  },
  pages: {
    signIn: "/login"
  }
});
