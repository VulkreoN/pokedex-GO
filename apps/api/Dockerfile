FROM node:26-slim
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NODE_ENV=production
RUN npm install -g pnpm@10.18.0
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @mydexpogo/api... --prod=false
COPY packages/shared packages/shared
COPY apps/api apps/api
WORKDIR /app/apps/api
EXPOSE 3000
CMD ["sh", "-c", "pnpm db:migrate && pnpm start"]
