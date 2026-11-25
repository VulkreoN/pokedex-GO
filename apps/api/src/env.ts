export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://mydex:mydex@localhost:5432/mydex',
  port: Number(process.env.PORT ?? 3000),
  /** Release (git commit) baked into the image by CI; 'dev' locally. */
  appVersion: process.env.APP_VERSION ?? 'dev',
  appCommit: process.env.APP_COMMIT ?? 'dev',
  corsOrigin: process.env.CORS_ORIGIN ?? '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  isProd: process.env.NODE_ENV === 'production',
  /** Where the generated dataset, event archive and source cache live (a Docker volume in production). */
  dataDir: process.env.DATA_DIR ?? new URL('../.data', import.meta.url).pathname,
  dataRefreshHours: Number(process.env.DATA_REFRESH_HOURS ?? 6),
  githubToken: process.env.GITHUB_TOKEN ?? '',
  feedPollMinutes: Number(process.env.FEED_POLL_MINUTES ?? 5),
  /** Official news locales to follow, e.g. "fr,en". Empty disables news polling. */
  newsLocales: (process.env.NEWS_LOCALES ?? 'fr').split(',').map((s) => s.trim()).filter(Boolean),
  /** Usernames that are admins no matter what (comma separated). Useful to bootstrap or recover an instance. */
  /** Web Push: VAPID keys (generated into DATA_DIR/vapid.json when absent) and contact (mailto: or https:). */
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
  vapidSubject: process.env.VAPID_SUBJECT ?? 'mailto:admin@example.com',
  /** Tests: record pushes in memory instead of sending them. */
  pushDryRun: process.env.PUSH_DRY_RUN === '1',
  adminUsernames: (process.env.ADMIN_USERNAMES ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
};
