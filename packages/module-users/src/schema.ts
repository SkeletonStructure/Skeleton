import { index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users_users', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export const userRoles = pgTable(
  'users_user_roles',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.role] })],
);

export const rolePermissions = pgTable(
  'users_role_permissions',
  {
    role: text('role').notNull(),
    permission: text('permission').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.role, table.permission] }),
    index('users_role_permissions_permission_idx').on(table.permission),
  ],
);
