import { createSkeletonClient, SkeletonError } from '@skeletonstructure/sdk';
import { type FormEvent, useEffect, useState } from 'react';

const client = createSkeletonClient({ baseUrl: '/v1' });

function describeError(error: unknown): string {
  return error instanceof SkeletonError ? `${error.name}: ${error.message}` : 'Unexpected error.';
}

export function App() {
  const [message, setMessage] = useState('Loading public configuration…');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [itemId, setItemId] = useState('');

  useEffect(() => {
    let active = true;
    void client.config
      .getPublic()
      .then((response) => {
        if (active)
          setMessage(`${response.data.appName}: ${response.data.publicModules.join(', ')}`);
      })
      .catch((error: unknown) => {
        if (active) setMessage(describeError(error));
      });
    return () => {
      active = false;
    };
  }, []);

  async function run(action: () => Promise<void>): Promise<void> {
    try {
      await action();
    } catch (error) {
      setMessage(describeError(error));
    }
  }

  function handleRegister(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      await client.auth.register({ email, password });
      setMessage('Registration complete.');
    });
  }

  function handleLogin(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void run(async () => {
      await client.auth.login({ email, password });
      setMessage('Signed in.');
    });
  }

  function handleCurrentUser(): void {
    void run(async () => {
      const response = await client.auth.getCurrentUser();
      setMessage(`${response.data.user.email}: ${response.data.roles.join(', ')}`);
    });
  }

  function handleUpdateProfile(): void {
    void run(async () => {
      await client.users.updateMe({ displayName: email });
      setMessage('Profile updated.');
    });
  }

  function handleBrowseProducts(): void {
    void run(async () => {
      const response = await client.products.getAll({ limit: 5 });
      setMessage(
        response.data.items.length === 0
          ? 'No products yet.'
          : response.data.items
              .map((item) => `${item.name} (${item.details.product.sku})`)
              .join(', '),
      );
    });
  }

  function handleCreateOrder(): void {
    void run(async () => {
      await client.orders.create(
        { items: [{ itemId, quantity: 1 }] },
        { idempotencyKey: `demo-checkout-${itemId}` },
      );
      setMessage('Order created.');
    });
  }

  function handleLogout(): void {
    void run(async () => {
      await client.auth.logout();
      setMessage('Signed out.');
    });
  }

  return (
    <main>
      <p>{message}</p>
      <form onSubmit={handleRegister}>
        <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" />
        <input
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          type="password"
        />
        <button type="submit">Register</button>
      </form>
      <form onSubmit={handleLogin}>
        <button type="submit">Sign in</button>
      </form>
      <button type="button" onClick={handleCurrentUser}>
        Current user
      </button>
      <button type="button" onClick={handleUpdateProfile}>
        Update profile
      </button>
      <button type="button" onClick={handleBrowseProducts}>
        Browse products
      </button>
      <input
        value={itemId}
        onChange={(event) => setItemId(event.target.value)}
        placeholder="Catalog item ID"
      />
      <button type="button" onClick={handleCreateOrder}>
        Create order
      </button>
      <button type="button" onClick={handleLogout}>
        Sign out
      </button>
    </main>
  );
}
