import type { AppConfig } from '@skeletonstructure/core/config';
import type { Database } from '@skeletonstructure/core/database';
import { hashPassword } from '@skeletonstructure/core/security';
import {
  catalogItems,
  createCatalogService,
  newPrefixedId,
} from '@skeletonstructure/module-catalog';
import { createInventoryService } from '@skeletonstructure/module-inventory';
import { createProductsService } from '@skeletonstructure/module-products';
import {
  createUsersService,
  normalizeEmail,
  rolePermissions,
} from '@skeletonstructure/module-users';

export const DEMO_PERMISSIONS = [
  'catalog:read',
  'orders:create',
  'orders:read',
  'cart:read',
  'cart:write',
  'cart:checkout',
] as const;

export const DEMO_PRODUCTS = [
  {
    slug: 'demo-coffee',
    name: 'Demo Coffee',
    description: 'A fresh bag of demo coffee beans.',
    sku: 'DEMO-COFFEE',
    priceAmount: 1_850,
    currency: 'USD',
    quantity: 25,
  },
  {
    slug: 'demo-mug',
    name: 'Demo Mug',
    description: 'A sturdy ceramic mug.',
    sku: 'DEMO-MUG',
    priceAmount: 1_200,
    currency: 'USD',
    quantity: 40,
  },
  {
    slug: 'demo-notebook',
    name: 'Demo Notebook',
    description: 'A pocket notebook for experiments.',
    sku: 'DEMO-NOTEBOOK',
    priceAmount: 900,
    currency: 'USD',
    quantity: 30,
  },
] as const;

export interface DemoCredentials {
  readonly email: string;
  readonly password: string;
}

/** Local-only demo credentials. Never expose these values to browser code. */
export function demoCredentials(): DemoCredentials {
  return {
    email: process.env.DEMO_USER_EMAIL ?? 'demo@skeletonstructure.local',
    password: process.env.DEMO_USER_PASSWORD ?? 'demo-password-123',
  };
}

export async function seedDemoEcommerce(
  database: Database,
  appConfig: AppConfig,
  credentials: DemoCredentials = demoCredentials(),
) {
  const users = createUsersService(database.db);
  const email = normalizeEmail(credentials.email);

  await database.db
    .insert(rolePermissions)
    .values(DEMO_PERMISSIONS.map((permission) => ({ role: 'user', permission })))
    .onConflictDoNothing();

  const existing = await users.findAuthUserByEmail(email);
  if (existing === undefined) {
    await users.createUser({
      email,
      passwordHash: await hashPassword(credentials.password),
      displayName: 'Demo Customer',
    });
  }

  const catalog = createCatalogService(database);
  const products = createProductsService({
    database,
    catalog,
    defaultCurrency: appConfig.modules.products.defaultCurrency,
  });
  const inventory = createInventoryService({
    database,
    catalog,
    allowNegativeStock: false,
  });

  for (const product of DEMO_PRODUCTS) {
    const now = new Date();
    const [item] = await database.db
      .insert(catalogItems)
      .values({
        id: newPrefixedId('cat'),
        slug: product.slug,
        name: product.name,
        description: product.description,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: catalogItems.slug,
        set: {
          name: product.name,
          description: product.description,
          status: 'active',
          updatedAt: now,
        },
      })
      .returning({ id: catalogItems.id });

    if (item === undefined) throw new Error(`Seeding failed for ${product.slug}.`);
    await products.upsert(item.id, {
      sku: product.sku,
      priceAmount: product.priceAmount,
      currency: product.currency,
    });
    await inventory.set(item.id, product.quantity);
  }

  return {
    user: existing === undefined ? 'created' : 'existing',
    products: DEMO_PRODUCTS.length,
  };
}
