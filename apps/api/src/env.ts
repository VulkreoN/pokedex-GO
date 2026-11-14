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
  /** Usernames that are admins no matter what (comma separated). Useful to bootstrap or recover an instance. */
  adminUsernames: (process.env.ADMIN_USERNAMES ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
};
