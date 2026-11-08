import type { MigrationInterface, QueryRunner } from "typeorm";

export class OrderedHistory1794400000000 implements MigrationInterface {
  name = "OrderedHistory1794400000000";
  async up(runner: QueryRunner) {
    // now() is constant throughout a transaction. clock_timestamp() preserves
    // the actual insertion order of separately saved proposals and audit events.
    for (const table of ["change_proposals", "checkpoint_events", "messages", "conversations", "evidence", "evidence_reviews"]) {
      await runner.query(`ALTER TABLE ${table} ALTER COLUMN "createdAt" SET DEFAULT clock_timestamp()`);
    }
  }
  async down() { throw new Error("This migration is forward-only."); }
}
