import type { MigrationInterface, QueryRunner } from "typeorm";

export class PersistentAdvisor1794100000000 implements MigrationInterface {
  name = "PersistentAdvisor1794100000000";
  async up(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE projects DROP CONSTRAINT projects_phase_check;
      ALTER TABLE projects ADD CHECK (phase IN ('interview','profile','workspace'));
      ALTER TABLE conversations DROP CONSTRAINT conversations_kind_check;
      ALTER TABLE conversations ADD CHECK (kind IN ('interview','followup','chat'));
      ALTER TABLE conversations ADD COLUMN "checkpointId" uuid REFERENCES checkpoints(id);
      CREATE TABLE project_facts (
        id uuid PRIMARY KEY, "projectId" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        key varchar(100) NOT NULL, label text NOT NULL, value text NOT NULL,
        provenance varchar NOT NULL CHECK (provenance IN ('founder_reported','ai_inferred','unknown')),
        confidence varchar NOT NULL CHECK (confidence IN ('low','medium','high')), "confirmedAt" timestamptz,
        UNIQUE ("projectId", key)
      );
      CREATE TABLE risks (
        id uuid PRIMARY KEY, "projectId" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        key varchar(100) NOT NULL, domain varchar NOT NULL CHECK (domain IN ('security','reliability','ai','cost')),
        title text NOT NULL, explanation text NOT NULL, uncertainty text NOT NULL, "legalFlag" text,
        UNIQUE ("projectId", key), UNIQUE ("projectId", id)
      );
      ALTER TABLE checkpoints DROP CONSTRAINT checkpoints_priority_check;
      ALTER TABLE checkpoints DROP CONSTRAINT checkpoints_status_check;
      UPDATE checkpoints SET priority = CASE priority WHEN 'critical' THEN 'P0' WHEN 'high' THEN 'P1' ELSE 'P2' END,
        status = CASE status WHEN 'complete' THEN 'founder_confirmed' WHEN 'in_progress' THEN 'planned' ELSE 'needs_action' END;
      ALTER TABLE checkpoints ALTER status SET DEFAULT 'needs_action';
      ALTER TABLE checkpoints ADD CHECK (priority IN ('P0','P1','P2'));
      ALTER TABLE checkpoints ADD CHECK (status IN ('unknown','needs_action','planned','implemented_unverified','evidence_reviewed','founder_confirmed'));
      ALTER TABLE checkpoints ADD COLUMN key varchar(100), ADD COLUMN "riskId" uuid,
        ADD COLUMN domain varchar NOT NULL DEFAULT 'security', ADD COLUMN uncertainty text NOT NULL DEFAULT 'Imported checkpoint; domain and assumptions need founder review.',
        ADD COLUMN "legalFlag" text, ADD COLUMN "reviewDate" date,
        ADD COLUMN disposition varchar NOT NULL DEFAULT 'active' CHECK (disposition IN ('active','deferred','risk_accepted','not_applicable')),
        ADD COLUMN "dispositionReason" text NOT NULL DEFAULT '';
      UPDATE checkpoints SET key = 'imported-' || id::text, "riskId" = id;
      INSERT INTO risks (id,"projectId",key,domain,title,explanation,uncertainty) SELECT id,"projectId",key,domain,title,risk,uncertainty FROM checkpoints;
      ALTER TABLE checkpoints ALTER key SET NOT NULL, ALTER "riskId" SET NOT NULL;
      ALTER TABLE checkpoints ADD UNIQUE ("projectId",key), ADD UNIQUE ("projectId",id), ADD FOREIGN KEY ("projectId","riskId") REFERENCES risks("projectId",id);
      ALTER TABLE evidence ADD COLUMN source text NOT NULL DEFAULT 'Founder-provided note';
      UPDATE evidence SET source = CASE WHEN kind = 'reviewed' THEN 'Review reported by ' || reviewer ELSE 'Reported implementation' END;
      ALTER TABLE evidence ADD UNIQUE ("checkpointId",id);
      CREATE TABLE risk_relations (
        id uuid PRIMARY KEY, "projectId" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        "fromRiskId" uuid NOT NULL, "toRiskId" uuid NOT NULL, type varchar NOT NULL CHECK (type IN ('depends_on','related_to')),
        FOREIGN KEY ("projectId","fromRiskId") REFERENCES risks("projectId",id), FOREIGN KEY ("projectId","toRiskId") REFERENCES risks("projectId",id),
        CHECK ("fromRiskId" <> "toRiskId"), UNIQUE ("projectId","fromRiskId","toRiskId",type)
      );
      CREATE TABLE evidence_reviews (
        id uuid PRIMARY KEY, "checkpointId" uuid NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE, "evidenceId" uuid NOT NULL,
        summary text NOT NULL, findings jsonb NOT NULL, "followupChecks" jsonb NOT NULL, criteria jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY ("checkpointId","evidenceId") REFERENCES evidence("checkpointId",id)
      );
      CREATE TABLE change_proposals (
        id uuid PRIMARY KEY, "projectId" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        "conversationId" uuid NOT NULL REFERENCES conversations(id), "messageId" uuid NOT NULL REFERENCES messages(id),
        rationale text NOT NULL, operation jsonb NOT NULL, before jsonb, state varchar NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected','deferred')),
        "decisionReason" text NOT NULL DEFAULT '', "createdAt" timestamptz NOT NULL DEFAULT now(), "decidedAt" timestamptz
      );
      CREATE INDEX proposals_project_idx ON change_proposals("projectId",state);
      CREATE TABLE review_triggers (
        id uuid PRIMARY KEY, "projectId" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, "checkpointId" uuid NOT NULL,
        description text NOT NULL, "dueAt" timestamptz, "resolvedAt" timestamptz,
        FOREIGN KEY ("projectId","checkpointId") REFERENCES checkpoints("projectId",id)
      );
      CREATE TABLE checkpoint_events (
        id uuid PRIMARY KEY, "projectId" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, "checkpointId" uuid,
        type varchar NOT NULL, detail jsonb NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY ("projectId","checkpointId") REFERENCES checkpoints("projectId",id)
      );
      CREATE INDEX events_project_idx ON checkpoint_events("projectId","createdAt");
      INSERT INTO checkpoint_events (id,"projectId","checkpointId",type,detail)
        SELECT gen_random_uuid(),"projectId",id,'legacy_import',jsonb_build_object('status',status,'completedAt',"completedAt",'note','Preserved from the previous workflow') FROM checkpoints;
      INSERT INTO review_triggers (id,"projectId","checkpointId",description)
        SELECT gen_random_uuid(),"projectId",id,jsonb_array_elements_text("reviewTriggers") FROM checkpoints;
      CREATE FUNCTION founderready_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'History records are immutable'; END $$;
      CREATE TRIGGER immutable_events BEFORE UPDATE OR DELETE ON checkpoint_events FOR EACH ROW EXECUTE FUNCTION founderready_immutable();
      CREATE TRIGGER immutable_evidence BEFORE UPDATE OR DELETE ON evidence FOR EACH ROW EXECUTE FUNCTION founderready_immutable();
      CREATE TRIGGER immutable_reviews BEFORE UPDATE OR DELETE ON evidence_reviews FOR EACH ROW EXECUTE FUNCTION founderready_immutable();
    `);
  }
  async down() { throw new Error("This data-preserving migration is forward-only. Restore a backup to roll back."); }
}
