import { createSkeletonClient, type SkeletonClient, SkeletonError } from '@skeletonstructure/sdk';

const client: SkeletonClient = createSkeletonClient({ baseUrl: '/v1' });

function describeError(error: unknown): string {
  return error instanceof SkeletonError ? `${error.name}: ${error.message}` : 'Unexpected error.';
}

export async function renderPublicConfig(target: HTMLElement): Promise<void> {
  try {
    const response = await client.config.getPublic();
    target.textContent = `${response.data.appName} (${response.data.publicModules.join(', ')})`;
  } catch (error) {
    target.textContent = describeError(error);
  }
}

export async function register(
  client: SkeletonClient,
  email: string,
  password: string,
): Promise<void> {
  await client.auth.register({ email, password });
}

export async function signIn(
  client: SkeletonClient,
  email: string,
  password: string,
): Promise<void> {
  await client.auth.login({ email, password });
}

export async function renderCurrentUser(target: HTMLElement): Promise<void> {
  try {
    const response = await client.auth.getCurrentUser();
    target.textContent = `${response.data.user.email}: ${response.data.roles.join(', ')}`;
  } catch (error) {
    target.textContent = describeError(error);
  }
}

export async function updateDisplayName(displayName: string): Promise<void> {
  await client.users.updateMe({ displayName });
}

export async function signOut(): Promise<void> {
  await client.auth.logout();
}

export function mount(root: HTMLElement): void {
  const status = document.createElement('p');
  status.textContent = 'Loading public configuration…';
  root.append(status);
  void renderPublicConfig(status);
}
