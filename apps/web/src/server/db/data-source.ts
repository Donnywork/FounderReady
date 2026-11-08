import "reflect-metadata";
import { DataSource } from "typeorm";
import { entities } from "./entities";
import { InitialSchema1794000000000 } from "./migrations/1794000000000-InitialSchema";
import { PersistentAdvisor1794100000000 } from "./migrations/1794100000000-PersistentAdvisor";
import { ProfileAndOwnership1794200000000 } from "./migrations/1794200000000-ProfileAndOwnership";
import { NormalizeRiskDetails1794300000000 } from "./migrations/1794300000000-NormalizeRiskDetails";
import { OrderedHistory1794400000000 } from "./migrations/1794400000000-OrderedHistory";
import { ContextualExploration1794500000000 } from "./migrations/1794500000000-ContextualExploration";

export function makeDataSource(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL is not configured");
  return new DataSource({
    type: "postgres", url, entities, migrations: [InitialSchema1794000000000, PersistentAdvisor1794100000000, ProfileAndOwnership1794200000000, NormalizeRiskDetails1794300000000, OrderedHistory1794400000000, ContextualExploration1794500000000],
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
