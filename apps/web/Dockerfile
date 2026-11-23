FROM node:26-slim AS build
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
RUN npm install -g pnpm@10.18.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile --filter @mydexpogo/web...
COPY packages/shared packages/shared
COPY apps/web apps/web
# The release (git commit) goes with each error the app reports.
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=$APP_VERSION
RUN pnpm --filter @mydexpogo/web build

FROM caddy:2-alpine
COPY apps/web/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
EXPOSE 80 443
CMD ["sh", "-c", "export SITE_ADDRESS=${DOMAIN:-:80}; exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile"]
