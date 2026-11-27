// src/main/config.ts — CONFIGURATION, part of the composition root.
// The environment is read once, at startup, by the entry point (server.ts), which hands it to loadConfig. Every
// value is validated here, so a wrong setting stops the process before it serves anything. The rest of the code
// never sees the environment: main/ passes each piece only the values it uses.

export interface AppConfig {
  readonly dbPath: string; // ":memory:" or a file path
  readonly port: number;
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(`Invalid configuration: ${message}`);
    this.name = 'ConfigError';
  }
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const dbPath = env.DB_PATH?.trim() || ':memory:';
  const portText = env.PORT?.trim() || '3000';
  const port = /^\d+$/.test(portText) ? Number(portText) : NaN;
  if (!(port >= 1 && port <= 65535)) throw new ConfigError(`PORT must be a whole number from 1 to 65535, got "${portText}"`);
  return { dbPath, port };
}
