import type { MigrationInterface, QueryRunner } from "typeorm";

export class ContextualExploration1794500000000 implements MigrationInterface {
  name = "ContextualExploration1794500000000";
  async up(runner: QueryRunner) {
    await runner.query('ALTER TABLE conversations ADD COLUMN exploration jsonb NULL');
  }
  async down(runner: QueryRunner) {
    await runner.query('ALTER TABLE conversations DROP COLUMN exploration');
  }
}
