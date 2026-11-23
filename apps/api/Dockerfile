FROM node:26-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NODE_ENV=production
RUN npm install -g pnpm@10.18.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/data/package.json packages/data/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @mydexpogo/api... --prod=false
COPY packages/shared packages/shared
COPY packages/data packages/data
COPY apps/api apps/api
WORKDIR /app/apps/api
ARG APP_VERSION=dev
ENV APP_VERSION=$APP_VERSION
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s --start-period=60s --retries=4 CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# exec: the API itself gets the stop signal (a shell or pnpm in between would not pass it on, and the container
# would only stop when killed).
CMD ["sh", "-c", "pnpm db:migrate && exec node --import tsx src/index.ts"]
