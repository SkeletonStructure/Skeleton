import { expect, test } from '@playwright/test';

const email = 'demo@skeletonstructure.local';
const password = 'demo-password-123';

test('browser can browse, manage a cart, check out, and view order history', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('Demo Coffee', { exact: true })).toBeVisible();
  await expect(page.getByText('Demo Mug', { exact: true })).toBeVisible();

  await page.getByPlaceholder('demo@skeletonstructure.local').fill(email);
  await page.getByPlaceholder('Password').fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();

  await expect(page.getByText('Logged in.')).toBeVisible();
  await expect(page.getByText(email, { exact: true })).toBeVisible();

  const coffeeCard = page.locator('article.card').filter({ hasText: 'Demo Coffee' });
  await coffeeCard.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Demo Coffee × 1')).toBeVisible();

  const cartPanel = page.locator('#cart');
  await cartPanel.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText('Your cart is empty.')).toBeVisible();

  await coffeeCard.getByRole('button', { name: 'Add to cart' }).click();
  await expect(page.getByText('Demo Coffee × 1')).toBeVisible();

  await cartPanel.getByRole('button', { name: 'Checkout' }).click();
  await expect(page.getByText(/Order .* confirmed\. No payment was captured\./)).toBeVisible();
  await expect(page.getByText('Your cart is empty.')).toBeVisible();

  const orderId = await page.locator('#orders article.card strong').first().textContent();
  expect(orderId).toMatch(/^ord_/);
  await expect(page.locator('#orders')).toContainText('Status: confirmed');
});
