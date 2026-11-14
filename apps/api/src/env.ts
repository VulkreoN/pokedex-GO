export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://mydex:mydex@localhost:5432/mydex',
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  isProd: process.env.NODE_ENV === 'production',
  /** Where the generated dataset, event archive and source cache live (a Docker volume in production). */
  dataDir: process.env.DATA_DIR ?? new URL('../.data', import.meta.url).pathname,
  dataRefreshHours: Number(process.env.DATA_REFRESH_HOURS ?? 6),
  githubToken: process.env.GITHUB_TOKEN ?? '',
  /** Discord bot token + "name=channelId,name=channelId" (channels followed from PokeMiners' announcement channels into your own server). */
  discordToken: process.env.DISCORD_BOT_TOKEN ?? '',
  discordChannels: Object.fromEntries(
    (process.env.DISCORD_CHANNELS ?? '')
      .split(',')
      .map((p) => p.trim().split('='))
      .filter((kv): kv is [string, string] => kv.length === 2 && !!kv[0] && !!kv[1]),
  ) as Record<string, string>,
  feedPollMinutes: Number(process.env.FEED_POLL_MINUTES ?? 5),
  /** Official news locales to follow, e.g. "fr,en". Empty disables news polling. */
  newsLocales: (process.env.NEWS_LOCALES ?? 'fr').split(',').map((s) => s.trim()).filter(Boolean),
  /** Usernames that are admins no matter what (comma separated). Useful to bootstrap or recover an instance. */
  adminUsernames: (process.env.ADMIN_USERNAMES ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
};
