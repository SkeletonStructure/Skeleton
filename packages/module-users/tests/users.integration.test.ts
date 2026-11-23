import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { closeDatabase, initializeDatabase } from '../../core/src/database/index.js';
import { createUsersService, DEFAULT_USER_ROLE, runUsersMigrations } from '../src/index.js';

let container: StartedPostgreSqlContainer | undefined;
let database: Awaited<ReturnType<typeof initializeDatabase>>;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('skeleton_test')
    .withUsername('skeleton')
    .withPassword('skeleton')
    .start();

  database = await initializeDatabase({
    url: container.getConnectionUri(),
    ssl: false,
    pool: { max: 5, idleTimeoutMs: 30_000, connectTimeoutMs: 10_000 },
  });
  await database.migrate();
  await runUsersMigrations(database);
}, 180_000);

afterAll(async () => {
  await closeDatabase();
  await container?.stop();
}, 60_000);

describe('users module (PostgreSQL integration)', () => {
  it('creates users, assigns the default role, and enforces email uniqueness', async () => {
    const users = createUsersService(database.db);
    const created = await users.createUser({
      email: '  Owner@Example.com ',
      passwordHash: 'argon2id$fixture',
      displayName: 'Owner',
    });

    expect(created.email).toBe('owner@example.com');
    expect(await users.listRoles(created.id)).toEqual([DEFAULT_USER_ROLE]);
    expect(await users.listPermissions(created.id)).toEqual([
      'users:read:self',
      'users:update:self',
    ]);

    await expect(
      users.createUser({ email: 'owner@example.com', passwordHash: 'other' }),
    ).rejects.toMatchObject({ status: 409, code: 'CONFLICT' });
  });

  it('separates permission checks from explicit ownership checks', async () => {
    const users = createUsersService(database.db);
    const owner = await users.createUser({
      email: 'owner2@example.com',
      passwordHash: 'hash',
    });
    const other = await users.createUser({
      email: 'other@example.com',
      passwordHash: 'hash',
    });

    const owned = await users.getOwnedProfile(owner.id, owner.id);
    expect(owned.id).toBe(owner.id);

    await expect(users.getOwnedProfile(owner.id, other.id)).rejects.toMatchObject({
      status: 403,
      code: 'FORBIDDEN',
    });
    await expect(
      users.updateOwnedProfile(owner.id, other.id, 'Changed', true),
    ).rejects.toMatchObject({ status: 403, code: 'FORBIDDEN' });

    const updated = await users.updateOwnedProfile(owner.id, owner.id, 'Renamed', true);
    expect(updated.displayName).toBe('Renamed');
  });

  it('treats a migration re-run as a no-op', async () => {
    expect((await runUsersMigrations(database)).upToDate).toBe(true);
    await database.db.execute(sql`DELETE FROM users_users`);
  });
});
