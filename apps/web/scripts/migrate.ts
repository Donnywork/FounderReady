import { loadRootEnv } from "../env.cjs";
import { makeDataSource } from "../src/server/db/data-source";

async function main() {
  loadRootEnv();
  const db = await makeDataSource().initialize();
  try {
    const migrations = await db.runMigrations({ transaction: "all" });
    console.log(migrations.length ? `Applied ${migrations.length} migration(s).` : "Database is up to date.");
  } finally { await db.destroy(); }
}
main().catch(() => { console.error("Migration failed. Check DATABASE_URL and PostgreSQL availability."); process.exitCode = 1; });
