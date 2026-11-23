import {
  createSkeletonClient,
  type OrdersGetResponse,
  type ProductsListResponse,
} from '@skeletonstructure/sdk';

import { createDemoCartClient, type DemoCart, DemoClientError } from './demo-client.js';

const api = createSkeletonClient({ baseUrl: '/v1', credentials: 'include' });
const demo = createDemoCartClient();

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (element === null) throw new Error(`Missing element: ${selector}`);
  return element;
}

const authPanel = must<HTMLDivElement>('#auth-panel');
const statusPanel = must<HTMLDivElement>('#status');
const productsPanel = must<HTMLDivElement>('#products');
const cartPanel = must<HTMLDivElement>('#cart');
const ordersPanel = must<HTMLDivElement>('#orders');

let csrfToken: string | undefined;
let checkoutKey: string | undefined;

type ProductItem = ProductsListResponse['data']['items'][number];
type Order = OrdersGetResponse['data']['orders'][number];

function setStatus(message: string, isError = false): void {
  statusPanel.textContent = message;
  statusPanel.classList.toggle('error', isError);
}

function messageOf(error: unknown): string {
  if (error instanceof DemoClientError || error instanceof Error) return error.message;
  return 'The request failed.';
}

function formatMoney(minorUnits: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(minorUnits / 100);
  } catch {
    return `${currency} ${(minorUnits / 100).toFixed(2)}`;
  }
}

function renderAuth(email: string | undefined): void {
  authPanel.replaceChildren();

  if (email === undefined) {
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.placeholder = 'demo@skeletonstructure.local';
    emailInput.id = 'login-email';

    const passwordInput = document.createElement('input');
    passwordInput.type = 'password';
    passwordInput.placeholder = 'Password';
    passwordInput.id = 'login-password';

    const loginButton = document.createElement('button');
    loginButton.textContent = 'Log in';
    loginButton.addEventListener('click', () => void login(emailInput.value, passwordInput.value));

    authPanel.append(emailInput, passwordInput, loginButton);
    return;
  }

  const label = document.createElement('span');
  label.textContent = email;

  const logoutButton = document.createElement('button');
  logoutButton.textContent = 'Log out';
  logoutButton.addEventListener('click', () => void logout());

  authPanel.append(label, logoutButton);
}

function renderProducts(items: readonly ProductItem[]): void {
  productsPanel.replaceChildren();
  for (const item of items) {
    const product = item.details.product;
    const card = document.createElement('article');
    card.className = 'card';

    const name = document.createElement('strong');
    name.textContent = item.name;

    const description = document.createElement('p');
    description.className = 'muted';
    description.textContent = item.description ?? '';

    const price = document.createElement('div');
    price.textContent = `${formatMoney(product.priceAmount, product.currency)} · SKU ${product.sku}`;

    const addButton = document.createElement('button');
    addButton.textContent = 'Add to cart';
    addButton.addEventListener('click', () => void addToCart(item.id));

    card.append(name, description, price, addButton);
    productsPanel.append(card);
  }
}

function renderCart(cart: DemoCart): void {
  cartPanel.replaceChildren();

  if (cart.items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'Your cart is empty.';
    cartPanel.append(empty);
    return;
  }

  for (const line of cart.items) {
    const row = document.createElement('div');
    row.className = 'line';

    const label = document.createElement('span');
    label.textContent = `${line.name} × ${line.quantity}`;

    const total = document.createElement('span');
    total.textContent = formatMoney(line.lineAmount, line.currency);

    const remove = document.createElement('button');
    remove.textContent = 'Remove';
    remove.addEventListener('click', () => void removeFromCart(line.itemId));

    row.append(label, total, remove);
    cartPanel.append(row);
  }

  const totalRow = document.createElement('div');
  totalRow.className = 'line';
  const totalLabel = document.createElement('strong');
  totalLabel.textContent = 'Total';
  const totalValue = document.createElement('strong');
  totalValue.textContent = formatMoney(cart.totalAmount, cart.currency ?? 'USD');
  totalRow.append(totalLabel, totalValue);
  cartPanel.append(totalRow);

  const checkoutButton = document.createElement('button');
  checkoutButton.textContent = checkoutKey === undefined ? 'Checkout' : 'Retry checkout';
  checkoutButton.addEventListener('click', () => void checkout());
  cartPanel.append(checkoutButton);
}

function renderOrders(orders: readonly Order[]): void {
  ordersPanel.replaceChildren();

  if (orders.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'muted';
    empty.textContent = 'No orders yet.';
    ordersPanel.append(empty);
    return;
  }

  for (const order of orders) {
    const card = document.createElement('article');
    card.className = 'card';

    const id = document.createElement('strong');
    id.textContent = order.id;

    const status = document.createElement('div');
    status.textContent = `Status: ${order.status} · ${formatMoney(order.totalAmount, order.currency)}`;

    const created = document.createElement('span');
    created.className = 'muted';
    created.textContent = new Date(order.createdAt).toLocaleString();

    card.append(id, status, created);
    ordersPanel.append(card);
  }
}

async function loadProducts(): Promise<void> {
  const response = await api.products.getAll({ status: 'active' });
  renderProducts(response.data.items);
}

async function loadCart(): Promise<void> {
  if (csrfToken === undefined) {
    renderCart({ items: [], itemCount: 0, totalAmount: 0 });
    return;
  }
  renderCart(await demo.get());
}

async function loadOrders(): Promise<void> {
  if (csrfToken === undefined) {
    renderOrders([]);
    return;
  }
  const response = await api.orders.list();
  renderOrders(response.data.orders);
}

async function login(email: string, password: string): Promise<void> {
  try {
    const response = await api.auth.login({ email, password });
    csrfToken = response.data.csrfToken;
    demo.setCsrfToken(csrfToken);
    renderAuth(response.data.user.email);
    setStatus('Logged in.');
    await Promise.all([loadCart(), loadOrders()]);
  } catch (error) {
    setStatus(messageOf(error), true);
  }
}

async function logout(): Promise<void> {
  try {
    await api.auth.logout();
  } finally {
    csrfToken = undefined;
    checkoutKey = undefined;
    demo.setCsrfToken('');
    renderAuth(undefined);
    await Promise.all([loadCart(), loadOrders()]);
    setStatus('Logged out.');
  }
}

async function addToCart(itemId: string): Promise<void> {
  try {
    renderCart(await demo.setItem(itemId, 1));
    setStatus('Added to cart.');
  } catch (error) {
    setStatus(messageOf(error), true);
  }
}

async function removeFromCart(itemId: string): Promise<void> {
  try {
    renderCart(await demo.removeItem(itemId));
    setStatus('Removed from cart.');
  } catch (error) {
    setStatus(messageOf(error), true);
  }
}

async function checkout(): Promise<void> {
  checkoutKey ??= crypto.randomUUID();
  try {
    const result = await demo.checkout(checkoutKey);
    if (result.cartCleared) {
      checkoutKey = undefined;
      setStatus(`Order ${result.order.id} confirmed. No payment was captured.`);
    } else {
      setStatus(
        `Order ${result.order.id} was confirmed, but cart cleanup failed. Keep this key and retry checkout.`,
        true,
      );
    }
    await Promise.all([loadCart(), loadOrders()]);
  } catch (error) {
    setStatus(messageOf(error), true);
  }
}

async function restoreSession(): Promise<void> {
  try {
    const response = await api.auth.getCurrentUser();
    csrfToken = response.data.csrfToken;
    demo.setCsrfToken(csrfToken);
    renderAuth(response.data.user.email);
  } catch {
    renderAuth(undefined);
  }
}

renderAuth(undefined);
await restoreSession();
await Promise.all([loadProducts(), loadCart(), loadOrders()]);
