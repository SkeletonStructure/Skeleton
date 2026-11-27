# Configuration reference

This file is generated from the core configuration field metadata. Do not edit it by hand.

Regenerate with `pnpm config:docs`.

## Precedence

1. Process environment variables
2. `.env.local`
3. `.env`
4. `skeleton.config.ts` values
5. Built-in defaults

Secret fields can only be supplied through environment variables using `env(...)` in the config file. Literal secrets in `skeleton.config.ts` fail validation.

## Fields

| Field | Environment variable | Required | Secret | Type | Default | Description |
| --- | --- | --- | --- | --- | --- | --- |
| `app.name` | — | no | no | `string` | `SkeletonStructure` | Display name used in logs and generated documentation |
| `app.env` | `NODE_ENV` | no | no | `development \| test \| production` | `development` | Runtime environment; production enables stricter validation |
| `app.url` | `APP_URL` | no | no | `string` | `http://localhost:3000` | Public application URL used for generated links |
| `server.host` | `HOST` | no | no | `string` | `0.0.0.0` | Address the HTTP server binds to |
| `server.port` | `PORT` | no | no | `integer` | `3000` | HTTP listen port between 1 and 65535 |
| `server.trustProxy` | `TRUST_PROXY` | no | no | `boolean` | `false` | Trust forwarded headers from a known reverse proxy |
| `database.url` | `DATABASE_URL` | yes | yes | `postgres connection string` | — | PostgreSQL connection string; must be supplied through env |
| `database.ssl` | `DATABASE_SSL` | no | no | `boolean` | `false` | Enable PostgreSQL TLS |
| `database.pool.max` | `DB_POOL_MAX` | no | no | `integer` | `10` | Maximum number of pooled database connections |
| `database.pool.idleTimeoutMs` | `DB_POOL_IDLE_TIMEOUT_MS` | no | no | `integer` | `300000` | Milliseconds an idle pooled connection may remain open |
| `database.pool.connectTimeoutMs` | `DB_POOL_CONNECT_TIMEOUT_MS` | no | no | `integer` | `10000` | Milliseconds to wait for a connection from the pool |
| `logging.level` | `LOG_LEVEL` | no | no | `trace \| debug \| info \| warn \| error` | `info` | Minimum log level |
| `logging.format` | `LOG_FORMAT` | no | no | `json \| pretty` | `json` | Log output format; production requires json |
| `logging.redact` | — | no | no | `string[]` | `password, token, cookie, authorization, databaseUrl` | Additional redaction keys; defaults cannot be removed |
| `security.sessionCookie.name` | — | no | no | `string` | `skel_session` | Name of the opaque session cookie |
| `security.sessionCookie.secure` | `COOKIE_SECURE` | no | no | `boolean` | `false` | Require HTTPS; must be true in production |
| `security.sessionCookie.sameSite` | — | no | no | `lax \| strict` | `lax` | Cookie SameSite policy |
| `security.sessionCookie.httpOnly` | — | no | no | `true` | `true` | Always true; JavaScript access to the session cookie is forbidden |
| `security.sessionCookie.maxAgeHours` | `SESSION_TTL_HOURS` | no | no | `integer` | `24` | Session lifetime in hours |
| `security.csrf.enabled` | — | no | no | `boolean` | `true` | CSRF protection for cookie-based mutations; cannot be disabled in production |
| `security.cors.origins` | `CORS_ORIGINS` | no | no | `string[]` | `[]` | Exact allowed origins; empty means same-origin only |
| `security.cors.credentials` | — | no | no | `boolean` | `true` | Allow credentials for explicitly listed origins |
| `security.rateLimit.enabled` | — | no | no | `boolean` | `true` | Enable the global request limiter; cannot be disabled in production |
| `security.rateLimit.store` | `RATE_LIMIT_STORE` | no | no | `memory \| redis` | `memory` | Shared limiter storage; redis requires an injected client |
| `security.rateLimit.failurePolicy` | — | no | no | `deny` | `deny` | Storage failures deny requests instead of silently skipping limits |
| `security.rateLimit.max` | `RATE_LIMIT_MAX` | no | no | `integer` | `100` | Maximum requests per window |
| `security.rateLimit.windowMs` | `RATE_LIMIT_WINDOW_MS` | no | no | `integer` | `60000` | Rate-limit window length in milliseconds |
| `security.rateLimit.redis.keyPrefix` | `RATE_LIMIT_REDIS_KEY_PREFIX` | no | no | `string` | `skel:ratelimit:` | Key prefix for the optional Redis limiter provider |
| `modules.auth.enabled` | — | no | no | `boolean` | `false` | Enable authentication and opaque database sessions |
| `modules.auth.passwordMinLength` | — | no | no | `integer` | `12` | Minimum accepted password length |
| `modules.users.enabled` | — | no | no | `boolean` | `false` | Enable user profiles |
| `modules.users.allowSelfUpdate` | — | no | no | `boolean` | `true` | Allow users to update their own profile |
| `modules.catalog.enabled` | — | no | no | `boolean` | `false` | Enable the generic catalog core |
| `modules.catalog.publicRead` | — | no | no | `boolean` | `false` | Allow anonymous catalog reads; explicit opt-in only |
| `modules.products.enabled` | — | no | no | `boolean` | `false` | Enable the e-commerce catalog extension |
| `modules.products.defaultCurrency` | — | no | no | `ISO 4217 code` | `USD` | Default currency for product prices |
| `modules.orders.enabled` | — | no | no | `boolean` | `false` | Enable authenticated orders |
| `modules.orders.requireIdempotencyKey` | — | no | no | `boolean` | `true` | Require an idempotency key when creating orders |
| `modules.inventory.enabled` | — | no | no | `boolean` | `false` | Enable stock tracking |
| `modules.inventory.allowNegativeStock` | — | no | no | `boolean` | `false` | Allow overselling when stock is exhausted |
| `providers.email.driver` | — | no | no | `console` | `console` | Email provider; only console is available in v0.1 |
