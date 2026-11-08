import { z } from "zod";

export const MAX_QUESTIONS = 5;
export const domains = { security: "Security & Privacy", reliability: "Reliability & Operations", ai: "AI-Specific Risks", cost: "Cost & Scalability" } as const;
export const domainSchema = z.enum(["security", "reliability", "ai", "cost"]);
export const explorationSchema = z.object({ domain: domainSchema.nullable() }).strict();
export const coverageReviewSchema = z.object({ domain: domainSchema, outcome: z.enum(["exploring", "assessed_no_risks"]), summary: z.string().min(10).max(1000) });
export const prioritySchema = z.enum(["P0", "P1", "P2"]);
export const statusSchema = z.enum(["unknown", "needs_action", "planned", "implemented_unverified", "evidence_reviewed", "founder_confirmed"]);
export const dispositionSchema = z.enum(["active", "deferred", "risk_accepted", "not_applicable"]);
export const provenanceSchema = z.enum(["founder_reported", "ai_inferred", "unknown"]);
export const stableKey = z.string().min(2).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const questionSchema = z.object({ text: z.string().min(10).max(700), explanation: z.string().max(900), suggestions: z.array(z.string().min(1).max(300)).max(4) });
export const nextQuestionSchema = z.object({ question: questionSchema.nullable() });
export const factSchema = z.object({ key: stableKey, label: z.string().min(2).max(120), value: z.string().min(1).max(1600), provenance: provenanceSchema, confidence: z.enum(["low", "medium", "high"]) });
export const profileSchema = z.object({ title: z.string().min(2).max(80), summary: z.string().min(20).max(1600), facts: z.array(factSchema).min(7).max(20) });
export const checkpointDraftSchema = z.object({
  key: stableKey, domain: domainSchema, title: z.string().min(5).max(160), risk: z.string().min(10).max(1800), priority: prioritySchema,
  reasoning: z.string().min(10).max(1000), action: z.string().min(10).max(1800), acceptanceCriteria: z.array(z.string().min(5).max(500)).min(2).max(6),
  reviewTriggers: z.array(z.string().min(5).max(500)).min(1).max(5), reviewDate: z.iso.date().nullable(),
  basis: z.enum(["reported", "unknown"]), uncertainty: z.string().min(5).max(1000), legalFlag: z.string().max(600).nullable(),
});
export const relationDraftSchema = z.object({ fromKey: stableKey, toKey: stableKey, type: z.enum(["depends_on", "related_to"]) });
export const assessmentSchema = z.object({ checkpoints: z.array(checkpointDraftSchema).min(3).max(5), relations: z.array(relationDraftSchema).max(4) });
export const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("set_fact"), fact: factSchema }),
  z.object({ type: z.literal("create_checkpoint"), checkpoint: checkpointDraftSchema }),
  z.object({ type: z.literal("update_checkpoint"), checkpoint: checkpointDraftSchema }),
  z.object({ type: z.literal("reopen_checkpoint"), key: stableKey, reason: z.string().min(5).max(1000) }),
  z.object({ type: z.literal("relate_risks"), relation: relationDraftSchema }),
]);
export const proposalDraftSchema = z.object({ rationale: z.string().min(5).max(1000), operation: operationSchema });
export const conversationResponseSchema = z.object({ answer: z.string().min(1).max(6000), followup: z.string().max(700).nullable(), materialChange: z.string().max(2000).nullable(), proposals: z.array(proposalDraftSchema).max(6) });
export const explorationResponseSchema = conversationResponseSchema.extend({ coverage: z.array(coverageReviewSchema).max(4) });
export const riskOverlapSchema = z.object({ existingKey: stableKey.nullable(), reason: z.string().min(5).max(1000) });
export const impactSchema = z.object({ summary: z.string().min(10).max(1600), proposals: z.array(proposalDraftSchema).max(8) });
export const engineeringPromptSchema = z.object({ prompt: z.string().min(100).max(10000) });
export const evidenceReviewSchema = z.object({ summary: z.string().min(10).max(1600), findings: z.array(z.object({ criterionIndex: z.number().int().min(0).max(5), assessment: z.enum(["supported", "unsupported", "unclear"]), explanation: z.string().min(5).max(1000) })).min(2).max(6), followupChecks: z.array(z.string().min(5).max(700)).max(6) });

export const createProjectSchema = z.object({ description: z.string().trim().min(20, "Tell us a little more—at least 20 characters.").max(4000) }).strict();
export const answerSchema = z.object({ questionId: z.uuid(), disposition: z.enum(["answered", "unknown", "skipped"]), answer: z.string().trim().max(4000).default("") }).strict().refine((v) => v.disposition !== "answered" || v.answer.length > 0, { message: "Add an answer, choose I don't know, or skip." });
export const interviewActionSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("next") }).strict(), z.object({ action: z.literal("answer"), response: answerSchema }).strict(), z.object({ action: z.literal("finish") }).strict()]);
export const profileInputSchema = profileSchema.extend({ facts: z.array(factSchema).min(7).max(30), approve: z.boolean() }).strict();
export const updateCheckpointSchema = z.object({
  owner: z.string().trim().max(120).optional(), status: statusSchema.optional(), disposition: dispositionSchema.optional(), reason: z.string().trim().max(1200).default(""), confirmCompletion: z.boolean().optional(), reviewDate: z.iso.date().nullable().optional(),
}).strict().refine((v) => v.status !== "founder_confirmed" || v.confirmCompletion === true, { message: "Explicitly confirm you reviewed the criteria and evidence." })
  .refine((v) => !(v.disposition && v.disposition !== "active" || v.status === "planned") || v.reason.length >= 5, { message: "Record a reason for planning, deferring, accepting a risk, or marking it not applicable." });
export const evidenceInputSchema = z.object({ content: z.string().trim().min(10).max(10000), source: z.string().trim().min(2).max(300) }).strict();
export const conversationInputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), checkpointId: z.uuid().nullable().default(null), exploration: explorationSchema.nullable().default(null) }).strict().refine((v) => !v.exploration || !v.checkpointId, { message: "Choose a readiness area or a checkpoint, not both." }),
  z.object({ action: z.literal("send"), conversationId: z.uuid(), content: z.string().trim().min(1).max(4000) }).strict(),
  z.object({ action: z.literal("retry"), conversationId: z.uuid() }).strict(),
]);
export const proposalDecisionSchema = z.object({ decision: z.enum(["approved", "rejected", "deferred"]), reason: z.string().trim().max(1200).default("") }).strict();
export const checkpointActionSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("prompt") }).strict(), z.object({ action: z.literal("review"), evidenceId: z.uuid() }).strict()]);

export type Question = z.infer<typeof questionSchema> & { id: string; topic?: string };
export type Domain = z.infer<typeof domainSchema>;
export type Exploration = z.infer<typeof explorationSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type Fact = z.infer<typeof factSchema> & { id: string; confirmedAt: string | null };
export type CheckpointDraft = z.infer<typeof checkpointDraftSchema>;
export type CheckpointStatus = z.infer<typeof statusSchema>;
export type Operation = z.infer<typeof operationSchema>;
export type EvidenceReview = z.infer<typeof evidenceReviewSchema> & { id: string; evidenceId: string; criteria: string[]; createdAt: string };
export type Evidence = { id: string; checkpointId: string; content: string; source: string; createdAt: string };
export type CheckpointEvent = { id: string; checkpointId: string | null; type: string; detail: Record<string, unknown>; createdAt: string };
export type ReviewTrigger = { id: string; checkpointId: string; description: string; dueAt: string | null; resolvedAt: string | null };
export type Checkpoint = CheckpointDraft & { id: string; projectId: string; riskId: string; owner: string; status: CheckpointStatus; disposition: z.infer<typeof dispositionSchema>; dispositionReason: string; engineeringPrompt: string; completedAt: string | null; evidence: Evidence[]; reviews: EvidenceReview[]; events: CheckpointEvent[]; triggers: ReviewTrigger[] };
export type Risk = { id: string; key: string; domain: z.infer<typeof domainSchema>; title: string; explanation: string; uncertainty: string; legalFlag: string | null };
export type RiskRelation = { id: string; fromRiskId: string; toRiskId: string; type: "depends_on" | "related_to" };
export type ChangeProposal = { id: string; conversationId: string; messageId: string; rationale: string; operation: Operation; before: unknown; state: "pending" | "approved" | "rejected" | "deferred"; decisionReason: string; createdAt: string; decidedAt: string | null };
export type Message = { id: string; conversationId: string; role: "user" | "assistant"; content: string; createdAt: string };
export type Conversation = { id: string; kind: "interview" | "followup" | "chat"; title: string; checkpointId: string | null; exploration: Exploration | null; createdAt: string; messages: Message[] };
export type ProjectSummary = { id: string; title: string; description: string; phase: "interview" | "profile" | "workspace"; updatedAt: string };
export type ProjectDetail = ProjectSummary & { summary: string; pendingQuestion: Question | null; answeredCount: number; facts: Fact[]; checkpoints: Checkpoint[]; risks: Risk[]; relations: RiskRelation[]; conversations: Conversation[]; proposals: ChangeProposal[]; events: CheckpointEvent[] };

export const statusLabels: Record<CheckpointStatus, string> = { unknown: "Unknown", needs_action: "Needs action", planned: "Planned", implemented_unverified: "Implemented · unverified", evidence_reviewed: "Evidence reviewed", founder_confirmed: "Founder-confirmed" };
export const dispositionLabels = { active: "Active", deferred: "Deferred", risk_accepted: "Risk accepted", not_applicable: "Not applicable" };
export const priorityRank = { P0: 0, P1: 1, P2: 2 };
export const isConfirmed = (c: Pick<Checkpoint, "status" | "disposition">) => c.status === "founder_confirmed" && c.disposition === "active";
export function readiness(checkpoints: Pick<Checkpoint, "status" | "priority" | "disposition">[]) {
  return { complete: checkpoints.filter(isConfirmed).length, total: checkpoints.length,
    critical: checkpoints.filter((c) => c.priority === "P0" && !isConfirmed(c) && c.disposition !== "risk_accepted" && c.disposition !== "not_applicable").length,
    unknown: checkpoints.filter((c) => c.status === "unknown").length, pending: checkpoints.filter((c) => !isConfirmed(c)).length, accepted: checkpoints.filter((c) => c.disposition === "risk_accepted").length };
}
export function nextActions(checkpoints: Checkpoint[], relations: RiskRelation[]) {
  const active = checkpoints.filter((c) => !isConfirmed(c) && c.disposition === "active");
  const blocks = (c: Checkpoint) => relations.filter((r) => r.type === "depends_on" && r.toRiskId === c.riskId && active.some((a) => a.riskId === r.fromRiskId)).length;
  return active.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority] || blocks(b) - blocks(a) || a.title.localeCompare(b.title)).slice(0, 3);
}
