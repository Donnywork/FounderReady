import "reflect-metadata";
import { DataSource } from "typeorm";
import { entities } from "./entities";
import { InitialSchema1794000000000 } from "./migrations/1794000000000-InitialSchema";

export function makeDataSource(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not configured");
  return new DataSource({
    type: "postgres", url, entities, migrations: [InitialSchema1794000000000],
    synchronize: false, migrationsRun: false, logging: false,
    extra: { max: 10, connectionTimeoutMillis: 5000, statement_timeout: 15000 },
  });
}
const globalDb = globalThis as unknown as { founderReadyDb?: Promise<DataSource> };
export async function getDb() {
  if (!globalDb.founderReadyDb) {
    globalDb.founderReadyDb = makeDataSource().initialize().catch((error) => {
      globalDb.founderReadyDb = undefined;
      throw error;
    });
  }
  return globalDb.founderReadyDb;
}
