import { z } from "zod";

export const MAX_QUESTIONS = 5;
export const prioritySchema = z.enum(["critical", "high", "medium"]);
export const statusSchema = z.enum(["open", "in_progress", "needs_review", "complete"]);
export const questionSchema = z.object({
  text: z.string().min(10).max(700),
  explanation: z.string().min(10).max(900),
  suggestions: z.array(z.string().min(1).max(300)).max(4),
});
export const nextQuestionSchema = z.object({ question: questionSchema.nullable() });
export const checkpointDraftSchema = z.object({
  title: z.string().min(5).max(160),
  risk: z.string().min(10).max(1800),
  priority: prioritySchema,
  reasoning: z.string().min(10).max(1000),
  action: z.string().min(10).max(1800),
  acceptanceCriteria: z.array(z.string().min(5).max(500)).min(2).max(6),
  engineeringPrompt: z.string().min(50).max(6000),
  reviewTriggers: z.array(z.string().min(5).max(500)).min(1).max(5),
  basis: z.enum(["reported", "unknown"]),
});
export const assessmentSchema = z.object({
  title: z.string().min(2).max(80),
  summary: z.string().min(20).max(1600),
  checkpoints: z.array(checkpointDraftSchema).min(3).max(5),
});
export const followupSchema = z.object({
  summary: z.string().min(20).max(1600),
  affectedCheckpointIds: z.array(z.string()).max(5),
  nextSteps: z.array(z.string().min(5).max(800)).min(1).max(5),
});
export const createProjectSchema = z.object({ description: z.string().trim().min(20, "Tell us a little more—at least 20 characters.").max(4000) }).strict();
export const answerSchema = z.object({
  questionId: z.uuid(),
  disposition: z.enum(["answered", "unknown", "skipped"]),
  answer: z.string().trim().max(4000).default(""),
}).strict().refine((v) => v.disposition !== "answered" || v.answer.length > 0, { message: "Add an answer, choose I don't know, or skip." });
export const interviewActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("next") }).strict(),
  z.object({ action: z.literal("answer"), response: answerSchema }).strict(),
  z.object({ action: z.literal("finish") }).strict(),
]);
export const followupActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), changes: z.string().trim().min(10).max(4000) }).strict(),
  z.object({ action: z.literal("answer"), response: answerSchema }).strict(),
  z.object({ action: z.literal("retry") }).strict(),
]);
export const updateCheckpointSchema = z.object({
  owner: z.string().trim().max(120).optional(),
  status: statusSchema.optional(),
  confirmCompletion: z.boolean().optional(),
}).strict().refine((v) => v.status !== "complete" || v.confirmCompletion === true, { message: "Confirm you have reviewed the acceptance criteria before completing this checkpoint." });
export const evidenceInputSchema = z.object({
  content: z.string().trim().min(10).max(6000),
  kind: z.enum(["reported", "reviewed"]),
  reviewer: z.string().trim().max(120).default(""),
}).strict().refine((v) => v.kind !== "reviewed" || v.reviewer.length >= 2, { message: "Name the person who reviewed this evidence." });

export type Question = z.infer<typeof questionSchema> & { id: string };
export type CheckpointDraft = z.infer<typeof checkpointDraftSchema>;
export type CheckpointStatus = z.infer<typeof statusSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type FollowupResult = z.infer<typeof followupSchema>;
export type Evidence = { id: string; checkpointId: string; content: string; kind: "reported" | "reviewed"; reviewer: string; createdAt: string };
export type Checkpoint = CheckpointDraft & { id: string; projectId: string; owner: string; status: CheckpointStatus; completedAt: string | null; evidence: Evidence[] };
export type Message = { id: string; conversationId: string; role: "user" | "assistant"; content: string; createdAt: string };
export type Conversation = { id: string; kind: "interview" | "followup"; title: string; createdAt: string; messages: Message[] };
export type ProjectSummary = { id: string; title: string; description: string; phase: "interview" | "workspace"; updatedAt: string };
export type ProjectDetail = ProjectSummary & {
  summary: string;
  pendingQuestion: Question | null;
  answeredCount: number;
  checkpoints: Checkpoint[];
  conversations: Conversation[];
  followup: { conversationId: string; changes: string; question: Question | null; answer: Answer | null; result: FollowupResult | null } | null;
};

export function readiness(checkpoints: Pick<Checkpoint, "status" | "priority">[]) {
  return {
    complete: checkpoints.filter((c) => c.status === "complete").length,
    total: checkpoints.length,
    urgent: checkpoints.filter((c) => c.status !== "complete" && (c.priority === "critical" || c.priority === "high")).length,
    needsReview: checkpoints.filter((c) => c.status === "needs_review").length,
  };
}
