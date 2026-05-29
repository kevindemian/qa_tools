FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY shared/types/ambient.d.ts ./shared/types/ambient.d.ts
COPY shared/ ./shared/
COPY jira_management/ ./jira_management/
COPY git_triggers/ ./git_triggers/
RUN npx tsc -p tsconfig.build.json

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache git openssh
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/node_modules ./node_modules
ENTRYPOINT ["node", "dist/jira_management/main.js"]
