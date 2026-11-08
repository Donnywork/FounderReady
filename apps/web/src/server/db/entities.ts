import { EntitySchema } from "typeorm";
import type { CheckpointDraft, CheckpointStatus, Question, Answer, Fact, Risk, RiskRelation, Operation, EvidenceReview, Exploration } from "@/lib/contracts";

export interface GuestRow { id: string; expiresAt: Date; aiWindowStart: Date; aiRequests: number }
export interface ProjectRow {
  id: string; guestId: string; title: string; description: string; phase: "interview" | "profile" | "workspace";
  summary: string; pendingQuestion: Question | null; followup: Record<string, unknown> | null;
  operationId: string | null; lockedAt: Date | null; createdAt: Date; updatedAt: Date;
}
export interface ConversationRow { id: string; projectId: string; kind: "interview" | "followup" | "chat"; title: string; checkpointId: string | null; exploration: Exploration | null; createdAt: Date }
export interface MessageRow { id: string; conversationId: string; role: "user" | "assistant"; content: string; createdAt: Date }
export interface ResponseRow { id: string; projectId: string; conversationId: string; questionId: string; question: Question; answer: string; disposition: Answer["disposition"]; createdAt: Date }
export interface CheckpointRow extends Omit<CheckpointDraft, "risk" | "domain" | "uncertainty" | "legalFlag"> { id: string; projectId: string; riskId: string; position: number; owner: string; status: CheckpointStatus; disposition: "active" | "deferred" | "risk_accepted" | "not_applicable"; dispositionReason: string; engineeringPrompt: string; completedAt: Date | null; createdAt: Date }
export interface EvidenceRow { id: string; checkpointId: string; content: string; source: string; kind: "reported" | "reviewed"; reviewer: string; createdAt: Date }
export interface FactRow extends Omit<Fact, "confirmedAt"> { projectId: string; confirmedAt: Date | null }
export interface RiskRow extends Risk { projectId: string }
export interface RelationRow extends RiskRelation { projectId: string }
export interface ReviewRow extends Omit<EvidenceReview, "createdAt"> { checkpointId: string; createdAt: Date }
export interface ProposalRow { id: string; projectId: string; conversationId: string; messageId: string; rationale: string; operation: Operation; before: unknown; state: "pending" | "approved" | "rejected" | "deferred"; decisionReason: string; createdAt: Date; decidedAt: Date | null }
export interface TriggerRow { id: string; projectId: string; checkpointId: string; description: string; dueAt: Date | null; resolvedAt: Date | null }
export interface EventRow { id: string; projectId: string; checkpointId: string | null; type: string; detail: Record<string, unknown>; createdAt: Date }

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
  id: uuid, projectId: { type: "uuid" }, kind: { type: "varchar" }, title: { type: "text" }, checkpointId: { type: "uuid", nullable: true }, exploration: { type: "jsonb", nullable: true }, createdAt: created,
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
  priority: { type: "varchar" }, reasoning: { type: "text" }, action: { type: "text" },
  acceptanceCriteria: { type: "jsonb" }, engineeringPrompt: { type: "text" }, reviewTriggers: { type: "jsonb" }, basis: { type: "varchar" },
  owner: { type: "varchar", length: 120, default: "" }, status: { type: "varchar", default: "open" },
  completedAt: { type: "timestamptz", nullable: true }, createdAt: created,
  key: { type: "varchar" }, riskId: { type: "uuid" }, reviewDate: { type: "date", nullable: true },
  disposition: { type: "varchar", default: "active" }, dispositionReason: { type: "text", default: "" },
} });
export const EvidenceEntity = new EntitySchema<EvidenceRow>({ name: "Evidence", tableName: "evidence", columns: {
  id: uuid, checkpointId: { type: "uuid" }, content: { type: "text" }, kind: { type: "varchar" },
  reviewer: { type: "varchar", length: 120, default: "" }, source: { type: "text" }, createdAt: created,
} });
export const FactEntity = new EntitySchema<FactRow>({ name: "ProjectFact", tableName: "project_facts", columns: { id: uuid, projectId: { type: "uuid" }, key: { type: "varchar" }, label: { type: "text" }, value: { type: "text" }, provenance: { type: "varchar" }, confidence: { type: "varchar" }, confirmedAt: { type: "timestamptz", nullable: true } } });
export const RiskEntity = new EntitySchema<RiskRow>({ name: "Risk", tableName: "risks", columns: { id: uuid, projectId: { type: "uuid" }, key: { type: "varchar" }, domain: { type: "varchar" }, title: { type: "text" }, explanation: { type: "text" }, uncertainty: { type: "text" }, legalFlag: { type: "text", nullable: true } } });
export const RelationEntity = new EntitySchema<RelationRow>({ name: "RiskRelation", tableName: "risk_relations", columns: { id: uuid, projectId: { type: "uuid" }, fromRiskId: { type: "uuid" }, toRiskId: { type: "uuid" }, type: { type: "varchar" } } });
export const ReviewEntity = new EntitySchema<ReviewRow>({ name: "EvidenceReview", tableName: "evidence_reviews", columns: { id: uuid, checkpointId: { type: "uuid" }, evidenceId: { type: "uuid" }, summary: { type: "text" }, findings: { type: "jsonb" }, followupChecks: { type: "jsonb" }, criteria: { type: "jsonb" }, createdAt: created } });
export const ProposalEntity = new EntitySchema<ProposalRow>({ name: "ChangeProposal", tableName: "change_proposals", columns: { id: uuid, projectId: { type: "uuid" }, conversationId: { type: "uuid" }, messageId: { type: "uuid" }, rationale: { type: "text" }, operation: { type: "jsonb" }, before: { type: "jsonb", nullable: true }, state: { type: "varchar", default: "pending" }, decisionReason: { type: "text", default: "" }, createdAt: created, decidedAt: { type: "timestamptz", nullable: true } } });
export const TriggerEntity = new EntitySchema<TriggerRow>({ name: "ReviewTrigger", tableName: "review_triggers", columns: { id: uuid, projectId: { type: "uuid" }, checkpointId: { type: "uuid" }, description: { type: "text" }, dueAt: { type: "timestamptz", nullable: true }, resolvedAt: { type: "timestamptz", nullable: true } } });
export const EventEntity = new EntitySchema<EventRow>({ name: "CheckpointEvent", tableName: "checkpoint_events", columns: { id: uuid, projectId: { type: "uuid" }, checkpointId: { type: "uuid", nullable: true }, type: { type: "varchar" }, detail: { type: "jsonb" }, createdAt: created } });
export const entities = [GuestEntity, ProjectEntity, ConversationEntity, MessageEntity, ResponseEntity, CheckpointEntity, EvidenceEntity, FactEntity, RiskEntity, RelationEntity, ReviewEntity, ProposalEntity, TriggerEntity, EventEntity];
