# The relay, built from the repository root: docker build -f apps/relay/Dockerfile .
FROM oven/bun:1.2.8-slim
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/relay/package.json apps/relay/
COPY packages/cloudevents/package.json packages/cloudevents/
COPY packages/ecosystem-identity/package.json packages/ecosystem-identity/
COPY packages/event-schemas/package.json packages/event-schemas/
COPY packages/outbox/package.json packages/outbox/
RUN bun install --frozen-lockfile --production
COPY packages/cloudevents/src packages/cloudevents/src
COPY apps/relay/src apps/relay/src
COPY deploy/staging/sink.ts deploy/staging/sink.ts
USER bun
EXPOSE 8080
CMD ["bun", "apps/relay/src/main.ts"]
