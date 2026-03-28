# steamtools.app

Next.js app ready for Vercel with secure backend proxy for `generator.ryuu.lol`, Discord login, and premium role gating.

## Features

- Mandatory Discord login to access the site
- Discord profile area in top-right (avatar + username + logout menu)
- Premium role gate:
  - `Request Update` and `Update Game` require premium role
  - If user does not have the role, action is blocked and a buy-premium message is shown
- Secure API routes (no API key exposed client-side)
- AppID validation (numeric only)
- Rate limiting on API routes
- Steam game mini preview (name + image) after AppID input
- Recent AppID history, dark/light mode, toasts

## Required environment variables

Copy `.env.example` to `.env` (or `.env.local`) and fill values:

```bash
RYUU_API_KEY=your_private_api_key_here

AUTH_SECRET=replace_with_a_long_random_secret
AUTH_URL=http://localhost:3000

DISCORD_CLIENT_ID=your_discord_oauth_client_id
DISCORD_CLIENT_SECRET=your_discord_oauth_client_secret

DISCORD_BOT_TOKEN=your_discord_bot_token
DISCORD_GUILD_ID=1363222357975502878
DISCORD_PREMIUM_ROLE_ID=1436609444174761985
CRON_SECRET=replace_with_a_long_random_secret_for_vercel_cron

MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=change_me
MYSQL_DATABASE=steamtools
MYSQL_CONNECTION_LIMIT=10
```

## Local run

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

## Discord setup notes

- Create a Discord OAuth2 application and set redirect URL:
  - `http://localhost:3000/api/auth/callback/discord` (local)
  - `https://your-domain/api/auth/callback/discord` (production)
- Invite your bot to the server with permission to read member roles.

## Deploy on Vercel

1. Import repository in Vercel
2. Add all environment variables from `.env.example`
3. Set production `AUTH_URL` to your real domain
4. Keep `CRON_SECRET` set so Vercel cron can call `/api/cron/daily-recap`
5. Deploy
