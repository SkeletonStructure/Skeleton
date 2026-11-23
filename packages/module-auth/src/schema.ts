import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/** FK-only reference; the users module owns the real table definition. */
const usersReference = pgTable('users_users', {
  id: uuid('id').primaryKey(),
});

export const sessions = pgTable(
  'auth_sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersReference.id, { onDelete: 'cascade' }),
    csrfHash: text('csrf_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).defaultNow().notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (table) => [
    index('auth_sessions_user_id_idx').on(table.userId),
    index('auth_sessions_expires_at_idx').on(table.expiresAt),
  ],
);

export const passwordResetTokens = pgTable(
  'auth_password_reset_tokens',
  {
    tokenHash: text('token_hash').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usersReference.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (table) => [index('auth_password_reset_tokens_user_id_idx').on(table.userId)],
);
