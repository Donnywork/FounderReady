import type { MigrationInterface, QueryRunner } from "typeorm";

export class ProfileAndOwnership1794200000000 implements MigrationInterface {
  name = "ProfileAndOwnership1794200000000";
  async up(runner: QueryRunner) {
    await runner.query(`
      INSERT INTO project_facts (id,"projectId",key,label,value,provenance,confidence)
      SELECT gen_random_uuid(), p.id, f.key, f.label,
        CASE WHEN f.key = 'product-stage' THEN p.description ELSE 'Unknown — imported project; review this detail with your builder.' END,
        CASE WHEN f.key = 'product-stage' THEN 'founder_reported' ELSE 'unknown' END, 'high'
      FROM projects p CROSS JOIN (VALUES
        ('product-stage','Product & stage'),('users-scale','Users & scale'),('stack-integrations','Stack & integrations'),
        ('data-handled','Data handled'),('ai-permissions','AI permissions'),('critical-workflows','Critical workflows'),('unknowns','Unknowns')
      ) AS f(key,label)
      WHERE p.phase = 'workspace' AND NOT EXISTS (SELECT 1 FROM project_facts WHERE "projectId" = p.id);
      ALTER TABLE conversations ADD UNIQUE ("projectId",id);
      ALTER TABLE messages ADD UNIQUE ("conversationId",id);
      ALTER TABLE conversations ADD FOREIGN KEY ("projectId","checkpointId") REFERENCES checkpoints("projectId",id);
      ALTER TABLE change_proposals ADD FOREIGN KEY ("projectId","conversationId") REFERENCES conversations("projectId",id);
      ALTER TABLE change_proposals ADD FOREIGN KEY ("conversationId","messageId") REFERENCES messages("conversationId",id);
      ALTER TABLE interview_responses ADD FOREIGN KEY ("projectId","conversationId") REFERENCES conversations("projectId",id);
    `);
  }
  async down() { throw new Error("This data-preserving migration is forward-only. Restore a backup to roll back."); }
}
