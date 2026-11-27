import { describe, it, expect } from 'vitest';
import { ConfigError, loadConfig } from '@/main/config';

// The configuration is a pure function of the environment it is given: no process.env here.
describe('loadConfig', () => {
  it('uses the defaults when nothing is set', () => {
    expect(loadConfig({})).toEqual({ dbPath: ':memory:', port: 3000 });
  });

  it('reads DB_PATH and PORT', () => {
    expect(loadConfig({ DB_PATH: 'shop.db', PORT: '8081' })).toEqual({ dbPath: 'shop.db', port: 8081 });
  });

  it('treats an empty value as unset', () => {
    expect(loadConfig({ DB_PATH: ' ', PORT: '' })).toEqual({ dbPath: ':memory:', port: 3000 });
  });

  it.each(['abc', '0', '65536', '-1', '80.5', '1e3'])('stops at startup on PORT=%s, naming the setting', (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: port })).toThrow(/PORT/);
  });
});
