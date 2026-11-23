import { randomUUID } from 'node:crypto';

/** Opaque correlation id for one request. Not derived from client input. */
export function newRequestId(): string {
  return `req_${randomUUID().replaceAll('-', '')}`;
}
