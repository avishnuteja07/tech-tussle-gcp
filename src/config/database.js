"use strict";

const { Pool } = require("pg");
const { env } = require("./env");

let pool = null;

function getPool() {
  if (!pool) {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not configured.");
    }
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });

    pool.on("error", (err) => {
      console.error("[PostgreSQL] Unexpected error on idle database client:", err.message);
    });
  }
  return pool;
}

/**
 * Executes a parameterized query using the connection pool.
 */
async function query(text, params = []) {
  const p = getPool();
  const start = Date.now();
  try {
    const result = await p.query(text, params);
    return result;
  } catch (error) {
    error.query = text;
    throw error;
  }
}

/**
 * Runs an asynchronous callback inside a managed database transaction.
 * Automatically BEGINs, COMMITs, and ROLLBACKs on error.
 */
async function withTransaction(callback) {
  const p = getPool();
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Database health check verifying basic query execution and latency.
 */
async function healthCheck() {
  const p = getPool();
  const t0 = Date.now();
  await p.query("SELECT 1 AS ping");
  return { ok: true, latencyMs: Date.now() - t0 };
}

/**
 * Gracefully closes the connection pool.
 */
async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * For testing purposes: allows overriding or injecting an in-memory/mock pool.
 */
function setPool(customPool) {
  pool = customPool;
}

module.exports = {
  getPool,
  setPool,
  query,
  withTransaction,
  healthCheck,
  closePool,
};
