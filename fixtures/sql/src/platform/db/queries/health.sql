-- name: AppliedMigrations :one
SELECT count(*) AS applied FROM schema_migrations;
