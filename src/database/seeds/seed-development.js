"use strict";

const { query, closePool } = require("../../config/database");
const { makePasswordHash } = require("../../shared/utils/crypto");
const { env } = require("../../config/env");

async function seedDevelopment() {
  if (env.NODE_ENV === "production") {
    console.error("[Seed] Refusing to seed development data in production mode.");
    process.exit(1);
  }

  console.log("[Seed] Seeding development sample data into PostgreSQL...");

  // 1. Create a dev administrator if none exists
  const adminUsername = env.ADMIN_USERNAME || "admin";
  const adminPassword = env.ADMIN_PASSWORD || "Admin@12345";
  const { passwordSalt: adminSalt, passwordHash: adminHash } = await makePasswordHash(adminPassword);

  await query(`
    INSERT INTO admins (username, password_salt, password_hash, managed_by_env)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (username) DO NOTHING
  `, [adminUsername, adminSalt, adminHash, Boolean(env.ADMIN_USERNAME)]);
  console.log(`[Seed] Development admin ensured: ${adminUsername}`);

  // 2. Create sample development students for test cohorts
  const sampleStudents = [
    { reg: "21691A0501", name: "Dev Student Year 1", year: 1 },
    { reg: "21691A0502", name: "Dev Student Year 2", year: 2 },
    { reg: "21691A0503", name: "Dev Student Year 3", year: 3 },
  ];

  const { passwordSalt: userSalt, passwordHash: userHash } = await makePasswordHash("tech@123");

  for (const s of sampleStudents) {
    await query(`
      INSERT INTO students (registration_number, full_name, study_year, password_salt, password_hash)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (registration_number) DO UPDATE
      SET full_name = EXCLUDED.full_name, study_year = EXCLUDED.study_year
    `, [s.reg, s.name, s.year, userSalt, userHash]);
  }
  console.log(`[Seed] Seeded ${sampleStudents.length} development students (password: tech@123)`);
}

if (require.main === module) {
  seedDevelopment()
    .then(async () => {
      await closePool();
      process.exit(0);
    })
    .catch(async (error) => {
      console.error("[Seed Error]", error.message);
      await closePool().catch(() => {});
      process.exit(1);
    });
}

module.exports = { seedDevelopment };
