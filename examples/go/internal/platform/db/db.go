// Package db is a driver: it opens the SQLite database and runs every module's migrations. It knows nothing
// about modules: bootstrap hands it the migration files.
package db

import (
	"database/sql"
	"fmt"
	"io/fs"
	"path"

	_ "modernc.org/sqlite" // pure-Go SQLite driver, registered as "sqlite"
)

// Open opens the database. An in-memory database lives in its connection, so the pool keeps exactly one.
func Open(dsn string) (*sql.DB, error) {
	conn, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, err
	}
	conn.SetMaxOpenConns(1)
	if _, err := conn.Exec("PRAGMA foreign_keys = ON"); err != nil {
		return nil, err
	}
	return conn, nil
}

// Migration is one module's set of migration files, named "<module>/<file>" in the bookkeeping table.
type Migration struct {
	Module string
	Files  fs.FS // files matching migrations/*.sql
}

func Migrate(conn *sql.DB, migrations []Migration) error {
	if _, err := conn.Exec("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)"); err != nil {
		return err
	}
	for _, m := range migrations {
		files, err := fs.Glob(m.Files, "migrations/*.sql")
		if err != nil {
			return err
		}
		for _, file := range files {
			name := m.Module + "/" + path.Base(file)
			var applied int
			if err := conn.QueryRow("SELECT count(*) FROM schema_migrations WHERE name = ?", name).Scan(&applied); err != nil {
				return err
			}
			if applied > 0 {
				continue
			}
			script, err := fs.ReadFile(m.Files, file)
			if err != nil {
				return err
			}
			if err := apply(conn, name, string(script)); err != nil {
				return fmt.Errorf("migration %s: %w", name, err)
			}
		}
	}
	return nil
}

func apply(conn *sql.DB, name, script string) error {
	tx, err := conn.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // a no-op after Commit
	if _, err := tx.Exec(script); err != nil {
		return err
	}
	if _, err := tx.Exec("INSERT INTO schema_migrations (name) VALUES (?)", name); err != nil {
		return err
	}
	return tx.Commit()
}
