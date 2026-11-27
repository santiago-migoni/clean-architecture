// Test helper (not a test file): serves an Express app on an ephemeral port.
import type { Express } from 'express';
import type { AddressInfo } from 'node:net';

export async function serve(app: Express) {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;

  const send = async (method: string, path: string, body?: unknown, rawBody?: string) => {
    const res = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json' },
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
    });
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };

  return { send, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
