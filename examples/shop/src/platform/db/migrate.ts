// Generic runner. It knows nothing about modules: main/ hands it every module's migrations.
import type { DatabaseSync } from 'node:sqlite';

export interface Migration { name: string; sql: string }

export function runMigrations(db: DatabaseSync, migrations: Migration[]): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)');
  const applied = new Set((db.prepare('SELECT name FROM schema_migrations').all() as unknown as { name: string }[]).map((r) => r.name));
  for (const m of migrations) {
    if (applied.has(m.name)) continue;
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO schema_migrations (name) VALUES (?)').run(m.name);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}
