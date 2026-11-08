import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1794000000000 implements MigrationInterface {
  name = "InitialSchema1794000000000";
  async up(runner: QueryRunner) {
    await runner.query(`
      CREATE TABLE guests (
        id varchar(64) PRIMARY KEY, "expiresAt" timestamptz NOT NULL,
        "aiWindowStart" timestamptz NOT NULL DEFAULT now(), "aiRequests" integer NOT NULL DEFAULT 0
      );
      CREATE TABLE projects (
        id uuid PRIMARY KEY, "guestId" varchar(64) NOT NULL REFERENCES guests(id) ON DELETE CASCADE,
        title varchar(80) NOT NULL, description text NOT NULL, phase varchar NOT NULL DEFAULT 'interview' CHECK (phase IN ('interview','workspace')),
        summary text NOT NULL DEFAULT '', "pendingQuestion" jsonb, followup jsonb, "operationId" uuid, "lockedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now(), "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX projects_guest_idx ON projects("guestId", "updatedAt");
      CREATE TABLE conversations (
        id uuid PRIMARY KEY, "projectId" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind varchar NOT NULL CHECK (kind IN ('interview','followup')), title text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX conversations_project_idx ON conversations("projectId");
      CREATE TABLE messages (
        id uuid PRIMARY KEY, "conversationId" uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role varchar NOT NULL CHECK (role IN ('user','assistant')), content text NOT NULL, "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX messages_conversation_idx ON messages("conversationId", "createdAt");
      CREATE TABLE interview_responses (
        id uuid PRIMARY KEY, "projectId" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        "conversationId" uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        "questionId" uuid UNIQUE NOT NULL, question jsonb NOT NULL, answer text NOT NULL,
        disposition varchar NOT NULL CHECK (disposition IN ('answered','unknown','skipped')), "createdAt" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX responses_project_idx ON interview_responses("projectId", "createdAt");
      CREATE TABLE checkpoints (
        id uuid PRIMARY KEY, "projectId" uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE, position integer NOT NULL,
        title varchar(160) NOT NULL, risk text NOT NULL, priority varchar NOT NULL CHECK (priority IN ('critical','high','medium')),
        reasoning text NOT NULL, action text NOT NULL, "acceptanceCriteria" jsonb NOT NULL, "engineeringPrompt" text NOT NULL,
        "reviewTriggers" jsonb NOT NULL, basis varchar NOT NULL CHECK (basis IN ('reported','unknown')),
        owner varchar(120) NOT NULL DEFAULT '', status varchar NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','needs_review','complete')),
        "completedAt" timestamptz, "createdAt" timestamptz NOT NULL DEFAULT now(), UNIQUE ("projectId", position)
      );
      CREATE TABLE evidence (
        id uuid PRIMARY KEY, "checkpointId" uuid NOT NULL REFERENCES checkpoints(id) ON DELETE CASCADE,
        content text NOT NULL, kind varchar NOT NULL CHECK (kind IN ('reported','reviewed')),
        reviewer varchar(120) NOT NULL DEFAULT '', "createdAt" timestamptz NOT NULL DEFAULT now(),
        CHECK (kind <> 'reviewed' OR length(trim(reviewer)) >= 2)
      );
      CREATE INDEX evidence_checkpoint_idx ON evidence("checkpointId", "createdAt");
    `);
  }
  async down(runner: QueryRunner) {
    await runner.query("DROP TABLE evidence, checkpoints, interview_responses, messages, conversations, projects, guests");
  }
}
