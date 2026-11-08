import "server-only";
import { randomUUID } from "node:crypto";
import { In, type EntityManager } from "typeorm";
import { z } from "zod";
import { MAX_QUESTIONS, type Answer, type ProjectDetail, type Question, type ProjectSummary, type interviewActionSchema, type followupActionSchema, type updateCheckpointSchema, type evidenceInputSchema } from "@/lib/contracts";
import { advisor } from "./ai/advisor";
import { AppError, type ApiContext, validId } from "./http";
import { CheckpointEntity, ConversationEntity, EvidenceEntity, GuestEntity, MessageEntity, ProjectEntity, ResponseEntity, type ProjectRow } from "./db/entities";

export async function ownedProject(ctx: ApiContext, id: string) {
  const project = await ctx.db.getRepository(ProjectEntity).findOneBy({ id: validId(id), guestId: ctx.guestId });
  if (!project) throw new AppError(404, "This project was not found in your workspace.");
  return project;
}
function summary(project: ProjectRow): ProjectSummary {
  return { id: project.id, title: project.title, description: project.description, phase: project.phase, updatedAt: project.updatedAt.toISOString() };
}
export async function listProjects(ctx: ApiContext) {
  return { projects: (await ctx.db.getRepository(ProjectEntity).find({ where: { guestId: ctx.guestId }, order: { updatedAt: "DESC" } })).map(summary) };
}
export async function createProject(ctx: ApiContext, description: string) {
  return ctx.db.transaction(async (manager) => {
    await manager.getRepository(GuestEntity).findOneOrFail({ where: { id: ctx.guestId }, lock: { mode: "pessimistic_write" } });
    if (await manager.count(ProjectEntity, { where: { guestId: ctx.guestId } }) >= 20) throw new AppError(429, "This guest workspace has reached its 20-project limit.");
    const project = await manager.save(ProjectEntity, { id: randomUUID(), guestId: ctx.guestId, description, title: description.split(/\s+/).slice(0, 7).join(" ").slice(0, 80), phase: "interview" as const, summary: "", pendingQuestion: null, followup: null, operationId: null, lockedAt: null });
    const conversationId = randomUUID();
    await manager.insert(ConversationEntity, { id: conversationId, projectId: project.id, kind: "interview", title: "Getting to know your product" });
    await message(manager, conversationId, "user", description);
    return { project: summary(project) };
  });
}
export async function projectDetail(ctx: ApiContext, id: string): Promise<ProjectDetail> {
  const project = await ownedProject(ctx, id);
  const [checkpoints, conversations, responses] = await Promise.all([
    ctx.db.getRepository(CheckpointEntity).find({ where: { projectId: id }, order: { position: "ASC" } }),
    ctx.db.getRepository(ConversationEntity).find({ where: { projectId: id }, order: { createdAt: "ASC" } }),
    ctx.db.getRepository(ResponseEntity).find({ where: { projectId: id }, select: ["conversationId"] }),
  ]);
  const [evidence, messages] = await Promise.all([
    checkpoints.length ? ctx.db.getRepository(EvidenceEntity).find({ where: { checkpointId: In(checkpoints.map((c) => c.id)) }, order: { createdAt: "ASC" } }) : [],
    conversations.length ? ctx.db.getRepository(MessageEntity).find({ where: { conversationId: In(conversations.map((c) => c.id)) }, order: { createdAt: "ASC", id: "ASC" } }) : [],
  ]);
  const interviewId = conversations.find((c) => c.kind === "interview")?.id;
  return {
    ...summary(project), summary: project.summary, pendingQuestion: project.pendingQuestion, followup: project.followup,
    answeredCount: responses.filter((r) => r.conversationId === interviewId).length,
    checkpoints: checkpoints.map((c) => ({ ...c, completedAt: c.completedAt?.toISOString() ?? null, evidence: evidence.filter((e) => e.checkpointId === c.id).map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })) })),
    conversations: conversations.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), messages: messages.filter((m) => m.conversationId === c.id).map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) })),
  };
}
async function message(manager: EntityManager, conversationId: string, role: "user" | "assistant", content: string) {
  await manager.insert(MessageEntity, { id: randomUUID(), conversationId, role, content });
}
async function saveAnswer(manager: EntityManager, projectId: string, conversationId: string, question: Question, answer: Answer) {
  if (question.id !== answer.questionId) throw new AppError(409, "This question has already changed. Refresh your workspace to continue.");
  const text = answer.disposition === "answered" ? answer.answer : answer.disposition === "unknown" ? "I don't know." : "Skipped this question.";
  await manager.insert(ResponseEntity, { id: randomUUID(), projectId, conversationId, questionId: question.id, question, disposition: answer.disposition, answer: text });
  await message(manager, conversationId, "user", text);
}
async function consumeBudget(ctx: ApiContext) {
  const rows = await ctx.db.query(`UPDATE guests SET
    "aiRequests" = CASE WHEN "aiWindowStart" < now() - interval '1 hour' THEN 1 ELSE "aiRequests" + 1 END,
    "aiWindowStart" = CASE WHEN "aiWindowStart" < now() - interval '1 hour' THEN now() ELSE "aiWindowStart" END
    WHERE id = $1 AND ("aiRequests" < 30 OR "aiWindowStart" < now() - interval '1 hour') RETURNING id`, [ctx.guestId]);
  if (!rows[0]?.length) throw new AppError(429, "You've reached the limit of 30 AI requests per hour for this guest workspace. Please return later.");
}
async function withOperation<T>(ctx: ApiContext, id: string, action: (operationId: string) => Promise<T>) {
  await ownedProject(ctx, id);
  const operationId = randomUUID();
  const result = await ctx.db.createQueryBuilder().update(ProjectEntity).set({ operationId, lockedAt: new Date() })
    .where('id = :id AND "guestId" = :guestId AND ("lockedAt" IS NULL OR "lockedAt" < :expired)', { id, guestId: ctx.guestId, expired: new Date(Date.now() - 120_000) }).execute();
  if (!result.affected) throw new AppError(409, "The advisor is already working on this project. Wait a moment, then refresh.");
  try { return await action(operationId); }
  finally { await ctx.db.getRepository(ProjectEntity).update({ id, guestId: ctx.guestId, operationId }, { operationId: null, lockedAt: null }); }
}
async function commit(ctx: ApiContext, id: string, operationId: string, work: (manager: EntityManager, project: ProjectRow) => Promise<void>) {
  await ctx.db.transaction(async (manager) => {
    const project = await manager.getRepository(ProjectEntity).findOne({ where: { id, guestId: ctx.guestId }, lock: { mode: "pessimistic_write" } });
    if (!project || project.operationId !== operationId) throw new AppError(409, "This request expired. Refresh your workspace to continue.");
    await work(manager, project);
    await manager.save(ProjectEntity, project);
  });
}
async function aiContext(ctx: ApiContext, id: string) {
  const project = await projectDetail(ctx, id);
  const responses = await ctx.db.getRepository(ResponseEntity).find({ where: { projectId: id }, order: { createdAt: "ASC" } });
  return {
    description: project.description, summary: project.summary,
    interview: responses.filter((r) => r.conversationId === project.conversations.find((c) => c.kind === "interview")?.id).map((r) => ({ question: r.question.text, answer: r.answer, disposition: r.disposition })),
    recentFollowups: project.conversations.filter((c) => c.kind === "followup" && c.id !== project.followup?.conversationId).slice(-5).map((c) => ({
      title: c.title, messages: c.messages.map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
    })),
    checkpoints: project.checkpoints.map((c) => ({ id: c.id, title: c.title, risk: c.risk, status: c.status, basis: c.basis, acceptanceCriteria: c.acceptanceCriteria, reviewTriggers: c.reviewTriggers, evidence: c.evidence.slice(-3).map((e) => ({ kind: e.kind, reviewer: e.reviewer, content: e.content.slice(0, 2000) })) })),
    followup: project.followup,
  };
}
export async function interview(ctx: ApiContext, id: string, input: z.infer<typeof interviewActionSchema>) {
  return withOperation(ctx, id, async (operationId) => {
    const project = await ownedProject(ctx, id);
    if (project.phase === "workspace") return projectDetail(ctx, id);
    const conversation = await ctx.db.getRepository(ConversationEntity).findOneByOrFail({ projectId: id, kind: "interview" });
    if (input.action === "answer") {
      await commit(ctx, id, operationId, async (manager, current) => {
        if (!current.pendingQuestion) throw new AppError(409, "This answer was already saved. Continue to the next question.");
        await saveAnswer(manager, id, conversation.id, current.pendingQuestion, input.response);
        current.pendingQuestion = null;
      });
    } else if (input.action === "next" && project.pendingQuestion) return projectDetail(ctx, id);
    const count = await ctx.db.getRepository(ResponseEntity).countBy({ conversationId: conversation.id });
    const context = await aiContext(ctx, id);
    if (input.action !== "finish" && count < MAX_QUESTIONS) {
      await consumeBudget(ctx);
      const next = await advisor.question(context);
      if (next.question) {
        const question = { ...next.question, id: randomUUID() };
        await commit(ctx, id, operationId, async (manager, current) => {
          current.pendingQuestion = question;
          await message(manager, conversation.id, "assistant", `${question.text}\n\n${question.explanation}`);
        });
        return projectDetail(ctx, id);
      }
    }
    await consumeBudget(ctx);
    const assessment = await advisor.assess(context);
    await commit(ctx, id, operationId, async (manager, current) => {
      current.title = assessment.title; current.summary = assessment.summary; current.phase = "workspace"; current.pendingQuestion = null;
      const ranks = { critical: 0, high: 1, medium: 2 };
      const ordered = [...assessment.checkpoints].sort((a, b) => ranks[a.priority] - ranks[b.priority]);
      await manager.insert(CheckpointEntity, ordered.map((c, position) => ({ ...c, id: randomUUID(), projectId: id, position, owner: "", status: "open" as const, completedAt: null })));
      await message(manager, conversation.id, "assistant", `${assessment.summary}\n\nYour checkpoints:\n${ordered.map((c, i) => `${i + 1}. ${c.title}`).join("\n")}`);
    });
    return projectDetail(ctx, id);
  });
}
export async function followup(ctx: ApiContext, id: string, input: z.infer<typeof followupActionSchema>) {
  return withOperation(ctx, id, async (operationId) => {
    const project = await ownedProject(ctx, id);
    if (project.phase !== "workspace") throw new AppError(409, "Finish your first assessment before revisiting risks.");
    if (input.action === "start") {
      if (project.followup && !project.followup.result) throw new AppError(409, "Finish the current follow-up before starting another.");
      if (await ctx.db.getRepository(ConversationEntity).countBy({ projectId: id, kind: "followup" }) >= 30) throw new AppError(429, "This project has reached its 30-follow-up limit.");
      await commit(ctx, id, operationId, async (manager, current) => {
        const conversationId = randomUUID();
        await manager.insert(ConversationEntity, { id: conversationId, projectId: id, kind: "followup", title: input.changes.slice(0, 70) });
        await message(manager, conversationId, "user", input.changes);
        current.followup = { conversationId, changes: input.changes, question: null, answer: null, result: null };
      });
    } else if (input.action === "answer") {
      await commit(ctx, id, operationId, async (manager, current) => {
        if (!current.followup?.question || current.followup.answer || current.followup.result) throw new AppError(409, "This follow-up question has already changed. Refresh to continue.");
        await saveAnswer(manager, id, current.followup.conversationId, current.followup.question, input.response);
        current.followup.answer = input.response;
      });
    }
    const current = await ownedProject(ctx, id);
    if (!current.followup) throw new AppError(409, "Describe what changed to start a follow-up.");
    if (current.followup.result || (current.followup.question && !current.followup.answer)) return projectDetail(ctx, id);
    const context = await aiContext(ctx, id);
    await consumeBudget(ctx);
    if (!current.followup.answer) {
      const { question } = await advisor.followupQuestion(context);
      await commit(ctx, id, operationId, async (manager, row) => {
        row.followup!.question = { ...question, id: randomUUID() };
        await message(manager, row.followup!.conversationId, "assistant", `${question.text}\n\n${question.explanation}`);
      });
    } else {
      const result = await advisor.followupAssess(context);
      const ids = new Set(context.checkpoints.map((c) => c.id));
      if (result.affectedCheckpointIds.some((cid) => !ids.has(cid))) throw new AppError(502, "The advisor returned an invalid checkpoint reference. Please retry; your answer is saved.");
      await commit(ctx, id, operationId, async (manager, row) => {
        row.followup!.result = result;
        if (result.affectedCheckpointIds.length) {
          await manager.getRepository(CheckpointEntity).update({ projectId: id, id: In(result.affectedCheckpointIds), status: "complete" }, { status: "needs_review", completedAt: null });
        }
        await message(manager, row.followup!.conversationId, "assistant", `${result.summary}\n\nNext steps:\n${result.nextSteps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`);
      });
    }
    return projectDetail(ctx, id);
  });
}
export async function updateCheckpoint(ctx: ApiContext, projectId: string, checkpointId: string, input: z.infer<typeof updateCheckpointSchema>) {
  await ownedProject(ctx, projectId);
  await ctx.db.transaction(async (manager) => {
    // Serialize manual completion against a follow-up that may reopen this checkpoint.
    const project = await manager.getRepository(ProjectEntity).findOneOrFail({ where: { id: projectId, guestId: ctx.guestId }, lock: { mode: "pessimistic_write" } });
    if (project.lockedAt && project.lockedAt.getTime() > Date.now() - 120_000) throw new AppError(409, "Wait for the advisor to finish before updating this checkpoint.");
    const checkpoint = await manager.getRepository(CheckpointEntity).findOneBy({ id: validId(checkpointId), projectId });
    if (!checkpoint) throw new AppError(404, "This checkpoint was not found in your workspace.");
    if (input.status === "complete" && !await manager.count(EvidenceEntity, { where: { checkpointId } })) throw new AppError(400, "Add supporting evidence before confirming completion.");
    if (input.owner !== undefined) checkpoint.owner = input.owner;
    if (input.status) { checkpoint.status = input.status; checkpoint.completedAt = input.status === "complete" ? new Date() : null; }
    await manager.save(CheckpointEntity, checkpoint);
    project.updatedAt = new Date();
    await manager.save(ProjectEntity, project);
  });
  return projectDetail(ctx, projectId);
}
export async function addEvidence(ctx: ApiContext, projectId: string, checkpointId: string, input: z.infer<typeof evidenceInputSchema>) {
  await ownedProject(ctx, projectId);
  await ctx.db.transaction(async (manager) => {
    const checkpoint = await manager.getRepository(CheckpointEntity).findOne({ where: { id: validId(checkpointId), projectId }, lock: { mode: "pessimistic_write" } });
    if (!checkpoint) throw new AppError(404, "This checkpoint was not found in your workspace.");
    if (await manager.count(EvidenceEntity, { where: { checkpointId } }) >= 30) throw new AppError(429, "This checkpoint has reached its 30-evidence-note limit.");
    await manager.insert(EvidenceEntity, { ...input, id: randomUUID(), checkpointId, reviewer: input.kind === "reviewed" ? input.reviewer : "" });
  });
  return projectDetail(ctx, projectId);
}
