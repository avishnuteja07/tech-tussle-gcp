"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { getPool, closePool, withTransaction } = require("../config/database");
const { env, validateEnv } = require("../config/env");

const SCHEMA_DIR = path.join(__dirname, "schema");

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client) {
  const res = await client.query(`SELECT name FROM schema_migrations ORDER BY id ASC`);
  return new Set(res.rows.map((r) => r.name));
}

async function runMigrations() {
  validateEnv();
  const pool = getPool();
  console.log(`[Migrations] Connecting to PostgreSQL database...`);

  await withTransaction(async (client) => {
    await ensureMigrationTable(client);
    const applied = await getAppliedMigrations(client);

    const files = fs.readdirSync(SCHEMA_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    let count = 0;
    for (const file of files) {
      if (!applied.has(file)) {
        console.log(`[Migrations] Applying ${file}...`);
        const filePath = path.join(SCHEMA_DIR, file);
        const sql = fs.readFileSync(filePath, "utf8");
        await client.query(sql);
        await client.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [file]);
        console.log(`[Migrations] Successfully applied ${file}`);
        count++;
      } else {
        console.log(`[Migrations] Already applied: ${file}`);
      }
    }

    if (count === 0) {
      console.log(`[Migrations] Database schema is up to date.`);
    } else {
      console.log(`[Migrations] Completed applying ${count} migration(s).`);
    }
  });
}

async function statusMigrations() {
  validateEnv();
  const pool = getPool();
  const client = await pool.connect();
  try {
    await ensureMigrationTable(client);
    const applied = await getAppliedMigrations(client);
    const files = fs.readdirSync(SCHEMA_DIR)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    console.log("\nMigration Status:");
    console.log("-----------------------------------------");
    for (const file of files) {
      const isApplied = applied.has(file);
      console.log(`[${isApplied ? "X" : " "}] ${file}`);
    }
    console.log("-----------------------------------------\n");
  } finally {
    client.release();
  }
}

if (require.main === module) {
  const arg = process.argv[2];
  const action = arg === "--status" ? statusMigrations : runMigrations;
  action()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("[Migrations] Error:", error.message);
      await closePool().catch(() => {});
      process.exit(1);
    });
}

module.exports = {
  runMigrations,
  statusMigrations,
};
