"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { setPool, withTransaction, query } = require("../../src/config/database");

test("Integration: Transaction rollback on failure", async () => {
  const operations = [];

  const mockClient = {
    async query(text, params) {
      operations.push({ text: text.trim(), params });
      if (text.includes("FAIL_NOW")) {
        throw new Error("Simulated database failure inside transaction");
      }
      return { rows: [], rowCount: 1 };
    },
    release() {
      operations.push({ text: "RELEASE" });
    },
  };

  const mockPool = {
    async connect() {
      return mockClient;
    },
    async query(text, params) {
      return mockClient.query(text, params);
    },
  };

  setPool(mockPool);

  await assert.rejects(
    async () => {
      await withTransaction(async (client) => {
        await client.query("INSERT INTO test_table (name) VALUES ($1)", ["Item 1"]);
        await client.query("FAIL_NOW");
      });
    },
    { message: "Simulated database failure inside transaction" }
  );

  const commandNames = operations.map((op) => op.text);
  assert.strictEqual(commandNames[0], "BEGIN", "Transaction must begin with BEGIN");
  assert.strictEqual(commandNames[commandNames.length - 2], "ROLLBACK", "Failed transaction must execute ROLLBACK");
  assert.strictEqual(commandNames[commandNames.length - 1], "RELEASE", "Client must be released");

  setPool(null); // Reset
});

test("Integration: Transaction commit on success", async () => {
  const operations = [];

  const mockClient = {
    async query(text, params) {
      operations.push({ text: text.trim(), params });
      return { rows: [{ id: 1 }], rowCount: 1 };
    },
    release() {
      operations.push({ text: "RELEASE" });
    },
  };

  const mockPool = {
    async connect() {
      return mockClient;
    },
    async query(text, params) {
      return mockClient.query(text, params);
    },
  };

  setPool(mockPool);

  const result = await withTransaction(async (client) => {
    await client.query("INSERT INTO students (registration_number) VALUES ($1)", ["21691A0501"]);
    return { success: true };
  });

  assert.strictEqual(result.success, true);
  const commandNames = operations.map((op) => op.text);
  assert.strictEqual(commandNames[0], "BEGIN");
  assert.strictEqual(commandNames[commandNames.length - 2], "COMMIT", "Successful transaction must execute COMMIT");
  assert.strictEqual(commandNames[commandNames.length - 1], "RELEASE");

  setPool(null);
});
