export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://mydex:mydex@localhost:5432/mydex',
  port: Number(process.env.PORT ?? 3000),
  corsOrigin: process.env.CORS_ORIGIN ?? '',
  cookieSecure: process.env.COOKIE_SECURE === 'true',
  isProd: process.env.NODE_ENV === 'production',
};
