import type { MigrationInterface, QueryRunner } from "typeorm";

export class NormalizeRiskDetails1794300000000 implements MigrationInterface {
  name = "NormalizeRiskDetails1794300000000";
  async up(runner: QueryRunner) {
    // PersistentAdvisor copied every legacy risk into risks. That row is now the
    // sole source for risk attributes, shared by the checklist and graph.
    await runner.query('ALTER TABLE checkpoints DROP COLUMN risk, DROP COLUMN domain, DROP COLUMN uncertainty, DROP COLUMN "legalFlag"');
  }
  async down() { throw new Error("This data-preserving migration is forward-only. Restore a backup to roll back."); }
}
