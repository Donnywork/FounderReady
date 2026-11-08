import { EntitySchema } from "typeorm";
import type { Answer, CheckpointDraft, CheckpointStatus, FollowupResult, Question } from "@/lib/contracts";

export interface GuestRow { id: string; expiresAt: Date; aiWindowStart: Date; aiRequests: number }
export interface ProjectRow {
  id: string; guestId: string; title: string; description: string; phase: "interview" | "workspace";
  summary: string; pendingQuestion: Question | null; followup: {
    conversationId: string; changes: string; question: Question | null; answer: Answer | null; result: FollowupResult | null;
  } | null;
  operationId: string | null; lockedAt: Date | null; createdAt: Date; updatedAt: Date;
}
export interface ConversationRow { id: string; projectId: string; kind: "interview" | "followup"; title: string; createdAt: Date }
export interface MessageRow { id: string; conversationId: string; role: "user" | "assistant"; content: string; createdAt: Date }
export interface ResponseRow { id: string; projectId: string; conversationId: string; questionId: string; question: Question; answer: string; disposition: Answer["disposition"]; createdAt: Date }
export interface CheckpointRow extends CheckpointDraft { id: string; projectId: string; position: number; owner: string; status: CheckpointStatus; completedAt: Date | null; createdAt: Date }
export interface EvidenceRow { id: string; checkpointId: string; content: string; kind: "reported" | "reviewed"; reviewer: string; createdAt: Date }

const uuid = { type: "uuid" as const, primary: true };
const created = { type: "timestamptz" as const, createDate: true };

export const GuestEntity = new EntitySchema<GuestRow>({ name: "Guest", tableName: "guests", columns: {
  id: { type: "varchar", length: 64, primary: true }, expiresAt: { type: "timestamptz" },
  aiWindowStart: { type: "timestamptz", default: () => "CURRENT_TIMESTAMP" }, aiRequests: { type: "integer", default: 0 },
} });
export const ProjectEntity = new EntitySchema<ProjectRow>({ name: "Project", tableName: "projects", columns: {
  id: uuid, guestId: { type: "varchar", length: 64 }, title: { type: "varchar", length: 80 }, description: { type: "text" },
  phase: { type: "varchar", default: "interview" }, summary: { type: "text", default: "" },
  pendingQuestion: { type: "jsonb", nullable: true }, followup: { type: "jsonb", nullable: true },
  operationId: { type: "uuid", nullable: true }, lockedAt: { type: "timestamptz", nullable: true },
  createdAt: created, updatedAt: { type: "timestamptz", updateDate: true },
} });
export const ConversationEntity = new EntitySchema<ConversationRow>({ name: "Conversation", tableName: "conversations", columns: {
  id: uuid, projectId: { type: "uuid" }, kind: { type: "varchar" }, title: { type: "text" }, createdAt: created,
} });
export const MessageEntity = new EntitySchema<MessageRow>({ name: "Message", tableName: "messages", columns: {
  id: uuid, conversationId: { type: "uuid" }, role: { type: "varchar" }, content: { type: "text" }, createdAt: created,
} });
export const ResponseEntity = new EntitySchema<ResponseRow>({ name: "InterviewResponse", tableName: "interview_responses", columns: {
  id: uuid, projectId: { type: "uuid" }, conversationId: { type: "uuid" }, questionId: { type: "uuid", unique: true },
  question: { type: "jsonb" }, answer: { type: "text" }, disposition: { type: "varchar" }, createdAt: created,
} });
export const CheckpointEntity = new EntitySchema<CheckpointRow>({ name: "Checkpoint", tableName: "checkpoints", columns: {
  id: uuid, projectId: { type: "uuid" }, position: { type: "integer" }, title: { type: "varchar", length: 160 },
  risk: { type: "text" }, priority: { type: "varchar" }, reasoning: { type: "text" }, action: { type: "text" },
  acceptanceCriteria: { type: "jsonb" }, engineeringPrompt: { type: "text" }, reviewTriggers: { type: "jsonb" }, basis: { type: "varchar" },
  owner: { type: "varchar", length: 120, default: "" }, status: { type: "varchar", default: "open" },
  completedAt: { type: "timestamptz", nullable: true }, createdAt: created,
} });
export const EvidenceEntity = new EntitySchema<EvidenceRow>({ name: "Evidence", tableName: "evidence", columns: {
  id: uuid, checkpointId: { type: "uuid" }, content: { type: "text" }, kind: { type: "varchar" },
  reviewer: { type: "varchar", length: 120, default: "" }, createdAt: created,
} });
export const entities = [GuestEntity, ProjectEntity, ConversationEntity, MessageEntity, ResponseEntity, CheckpointEntity, EvidenceEntity];
