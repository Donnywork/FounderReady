import "server-only";
import { randomUUID } from "node:crypto";
import { In, IsNull, type EntityManager } from "typeorm";
import { z } from "zod";
import { MAX_QUESTIONS, priorityRank, type ProjectDetail, type ProjectSummary, type interviewActionSchema, type profileInputSchema, type updateCheckpointSchema, type evidenceInputSchema, type checkpointActionSchema } from "@/lib/contracts";
import { advisor } from "./ai/advisor";
import { interviewFocus } from "./ai/interview-focus";
import { readinessCoverage } from "@/lib/coverage";
import { AppError, type ApiContext, validId } from "./http";
import { CheckpointEntity, ConversationEntity, EvidenceEntity, GuestEntity, MessageEntity, ProjectEntity, ResponseEntity, FactEntity, RiskEntity, RelationEntity, ReviewEntity, ProposalEntity, TriggerEntity, EventEntity, type ProjectRow } from "./db/entities";
import { saveCheckpoint, saveRelation, audit, riskFields } from "./state";

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
    await manager.insert(ConversationEntity, { id: conversationId, projectId: project.id, kind: "interview", title: "Getting to know your product", checkpointId: null });
    await message(manager, conversationId, "user", description);
    return { project: summary(project) };
  });
}
export async function projectDetail(ctx: ApiContext, id: string): Promise<ProjectDetail> {
  const project = await ownedProject(ctx, id);
  const [checkpoints, conversations, responses, facts, risks, relations, proposals, triggers, events] = await Promise.all([
    ctx.db.getRepository(CheckpointEntity).find({ where: { projectId: id }, order: { position: "ASC" } }),
    ctx.db.getRepository(ConversationEntity).find({ where: { projectId: id }, order: { createdAt: "ASC" } }),
    ctx.db.getRepository(ResponseEntity).find({ where: { projectId: id }, select: ["conversationId"] }),
    ctx.db.getRepository(FactEntity).find({ where: { projectId: id }, order: { key: "ASC" } }),
    ctx.db.getRepository(RiskEntity).findBy({ projectId: id }), ctx.db.getRepository(RelationEntity).findBy({ projectId: id }),
    ctx.db.getRepository(ProposalEntity).find({ where: { projectId: id }, order: { createdAt: "ASC", id: "ASC" } }),
    ctx.db.getRepository(TriggerEntity).findBy({ projectId: id }),
    ctx.db.getRepository(EventEntity).find({ where: { projectId: id }, order: { createdAt: "ASC", id: "ASC" } }),
  ]);
  const ids = checkpoints.map((c) => c.id);
  const [evidence, messages, reviews] = await Promise.all([
    ids.length ? ctx.db.getRepository(EvidenceEntity).find({ where: { checkpointId: In(ids) }, order: { createdAt: "ASC" } }) : [],
    conversations.length ? ctx.db.getRepository(MessageEntity).find({ where: { conversationId: In(conversations.map((c) => c.id)) }, order: { createdAt: "ASC" } }) : [],
    ids.length ? ctx.db.getRepository(ReviewEntity).find({ where: { checkpointId: In(ids) }, order: { createdAt: "ASC" } }) : [],
  ]);
  const history = events.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
  return {
    ...summary(project), summary: project.summary, pendingQuestion: project.pendingQuestion,
    answeredCount: responses.filter((r) => r.conversationId === conversations.find((c) => c.kind === "interview")?.id).length,
    facts: facts.map((f) => ({ ...f, confirmedAt: f.confirmedAt?.toISOString() ?? null })), risks, relations,
    proposals: proposals.map((p) => ({ ...p, createdAt: p.createdAt.toISOString(), decidedAt: p.decidedAt?.toISOString() ?? null })), events: history,
    checkpoints: checkpoints.map((c) => ({ ...c, ...riskFields(risks.find((r) => r.id === c.riskId)!), completedAt: c.completedAt?.toISOString() ?? null,
      evidence: evidence.filter((e) => e.checkpointId === c.id).map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
      reviews: reviews.filter((r) => r.checkpointId === c.id).map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
      events: history.filter((e) => e.checkpointId === c.id),
      triggers: triggers.filter((t) => t.checkpointId === c.id).map((t) => ({ ...t, dueAt: t.dueAt?.toISOString() ?? null, resolvedAt: t.resolvedAt?.toISOString() ?? null })),
    })),
    conversations: conversations.map((c) => ({ ...c, createdAt: c.createdAt.toISOString(), messages: messages.filter((m) => m.conversationId === c.id).map((m) => ({ ...m, createdAt: m.createdAt.toISOString() })) })),
  };
}
export async function message(manager: EntityManager, conversationId: string, role: "user" | "assistant", content: string) {
  const id = randomUUID();
  await manager.insert(MessageEntity, { id, conversationId, role, content });
  return id;
}
export async function consumeBudget(ctx: ApiContext) {
  const rows = await ctx.db.query(`UPDATE guests SET
    "aiRequests" = CASE WHEN "aiWindowStart" < now() - interval '1 hour' THEN 1 ELSE "aiRequests" + 1 END,
    "aiWindowStart" = CASE WHEN "aiWindowStart" < now() - interval '1 hour' THEN now() ELSE "aiWindowStart" END
    WHERE id = $1 AND ("aiRequests" < 30 OR "aiWindowStart" < now() - interval '1 hour') RETURNING id`, [ctx.guestId]);
  if (!rows[0]?.length) throw new AppError(429, "You've reached the limit of 30 AI requests per hour for this guest workspace. Please return later.");
}
export async function withOperation<T>(ctx: ApiContext, id: string, action: (operationId: string) => Promise<T>) {
  await ownedProject(ctx, id);
  const operationId = randomUUID();
  const result = await ctx.db.createQueryBuilder().update(ProjectEntity).set({ operationId, lockedAt: new Date() })
    .where('id = :id AND "guestId" = :guestId AND ("lockedAt" IS NULL OR "lockedAt" < :expired)', { id, guestId: ctx.guestId, expired: new Date(Date.now() - 180_000) }).execute();
  if (!result.affected) throw new AppError(409, "The advisor is already working on this project. Wait a moment, then refresh.");
  try { return await action(operationId); }
  finally { await ctx.db.getRepository(ProjectEntity).update({ id, guestId: ctx.guestId, operationId }, { operationId: null, lockedAt: null }); }
}
export async function commit(ctx: ApiContext, id: string, operationId: string, work: (manager: EntityManager, project: ProjectRow) => Promise<void>) {
  await ctx.db.transaction(async (manager) => {
    const project = await manager.getRepository(ProjectEntity).findOne({ where: { id, guestId: ctx.guestId }, lock: { mode: "pessimistic_write" } });
    if (!project || project.operationId !== operationId) throw new AppError(409, "This request expired. Refresh your workspace to continue.");
    await work(manager, project);
    project.updatedAt = new Date();
    await manager.save(ProjectEntity, project);
  });
}
export async function aiContext(ctx: ApiContext, id: string) {
  const project = await projectDetail(ctx, id);
  const responses = await ctx.db.getRepository(ResponseEntity).find({ where: { projectId: id }, order: { createdAt: "ASC" } });
  return { today: new Date().toISOString().slice(0, 10), description: project.description, summary: project.summary, facts: project.facts, risks: project.risks, relations: project.relations,
    coverage: readinessCoverage(project),
    interview: responses.filter((r) => r.conversationId === project.conversations.find((c) => c.kind === "interview")?.id).map((r) => ({ question: r.question.text, answer: r.answer, disposition: r.disposition, topic: r.question.topic })),
    checkpoints: project.checkpoints.map((c) => ({ id: c.id, key: c.key, domain: c.domain, title: c.title, risk: c.risk, priority: c.priority, reasoning: c.reasoning, action: c.action, acceptanceCriteria: c.acceptanceCriteria, reviewTriggers: c.reviewTriggers, reviewDate: c.reviewDate, basis: c.basis, uncertainty: c.uncertainty, legalFlag: c.legalFlag, owner: c.owner, status: c.status, disposition: c.disposition, latestReview: c.reviews.at(-1) })),
    pendingProposals: project.proposals.filter((p) => p.state === "pending" || p.state === "deferred").map((p) => p.operation),
  };
}
export async function interview(ctx: ApiContext, id: string, input: z.infer<typeof interviewActionSchema>) {
  return withOperation(ctx, id, async (operationId) => {
    const project = await ownedProject(ctx, id);
    if (project.phase !== "interview") return projectDetail(ctx, id);
    const conversation = await ctx.db.getRepository(ConversationEntity).findOneByOrFail({ projectId: id, kind: "interview" });
    if (input.action === "answer") {
      await commit(ctx, id, operationId, async (manager, current) => {
        if (!current.pendingQuestion || current.pendingQuestion.id !== input.response.questionId) throw new AppError(409, "This answer was already saved or the question changed. Continue from the saved question.");
        const answer = input.response;
        const text = answer.disposition === "answered" ? answer.answer : answer.disposition === "unknown" ? "I don't know." : "Skipped this question.";
        await manager.insert(ResponseEntity, { id: randomUUID(), projectId: id, conversationId: conversation.id, questionId: answer.questionId, question: current.pendingQuestion, disposition: answer.disposition, answer: text });
        await message(manager, conversation.id, "user", text);
        current.pendingQuestion = null;
      });
    } else if (input.action === "next" && project.pendingQuestion) return projectDetail(ctx, id);
    const count = await ctx.db.getRepository(ResponseEntity).countBy({ conversationId: conversation.id });
    const context = await aiContext(ctx, id);
    if (input.action !== "finish" && count < MAX_QUESTIONS) {
      await consumeBudget(ctx);
      const focus = interviewFocus(context);
      const next = await advisor.nextInterviewQuestion({ ...context, ...focus });
      if (next.question) {
        const question = { ...next.question, id: randomUUID(), ...(focus.focusTopic ? { topic: focus.focusTopic } : {}) };
        await commit(ctx, id, operationId, async (manager, current) => { current.pendingQuestion = question; await message(manager, conversation.id, "assistant", `${question.text}\n\n${question.explanation}`); });
        return projectDetail(ctx, id);
      }
    }
    await consumeBudget(ctx);
    const profile = await advisor.proposeProjectProfile(context);
    if (new Set(profile.facts.map((f) => f.key)).size !== profile.facts.length) throw new AppError(502, "The advisor repeated a profile fact. Retry; your answers are saved.");
    await commit(ctx, id, operationId, async (manager, current) => {
      current.title = profile.title; current.summary = profile.summary; current.phase = "profile"; current.pendingQuestion = null;
      await manager.insert(FactEntity, profile.facts.map((f) => ({ ...f, id: randomUUID(), projectId: id, confirmedAt: null })));
      // Keep literal uncertainty even if a model omits it from its summary.
      const unknowns = await manager.find(ResponseEntity, { where: { projectId: id, disposition: In(["unknown", "skipped"]) } });
      for (const r of unknowns) await manager.insert(FactEntity, { id: randomUUID(), projectId: id, key: `unanswered-${r.questionId}`, label: r.question.text.slice(0, 120), value: r.answer, provenance: "unknown", confidence: "high", confirmedAt: null });
      await audit(manager, id, null, "profile_proposed", { profile });
    });
    return projectDetail(ctx, id);
  });
}
export async function updateProfile(ctx: ApiContext, id: string, input: z.infer<typeof profileInputSchema>) {
  return withOperation(ctx, id, async (operationId) => {
    const project = await ownedProject(ctx, id);
    if (project.phase === "interview") throw new AppError(409, "Finish the interview first.");
    if (new Set(input.facts.map((f) => f.key)).size !== input.facts.length) throw new AppError(400, "Each profile fact needs a unique key.");
    await commit(ctx, id, operationId, async (manager, row) => {
      const before = await manager.find(FactEntity, { where: { projectId: id } });
      for (const fact of input.facts) {
        const existing = before.find((f) => f.key === fact.key);
        await manager.save(FactEntity, { ...fact, id: existing?.id ?? randomUUID(), projectId: id, confirmedAt: fact.provenance === "founder_reported" ? new Date() : null });
      }
      row.title = input.title; row.summary = input.summary;
      await audit(manager, id, null, input.approve ? "profile_approved" : "profile_edited", { before, after: input.facts });
    });
    if (input.approve && project.phase === "profile") {
      await consumeBudget(ctx);
      const assessment = await advisor.assessRisks(await aiContext(ctx, id));
      const keys = new Set(assessment.checkpoints.map((c) => c.key));
      if (keys.size !== assessment.checkpoints.length || assessment.relations.some((r) => !keys.has(r.fromKey) || !keys.has(r.toKey))) throw new AppError(502, "The advisor returned inconsistent checkpoint references. Your profile is saved; retry approval.");
      await commit(ctx, id, operationId, async (manager, row) => {
        for (const c of [...assessment.checkpoints].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority])) await saveCheckpoint(manager, id, c);
        for (const relation of assessment.relations) await saveRelation(manager, id, relation);
        row.phase = "workspace";
      });
    }
    return projectDetail(ctx, id);
  });
}
export async function ownedCheckpoint(manager: EntityManager, projectId: string, checkpointId: string) {
  const checkpoint = await manager.findOneBy(CheckpointEntity, { id: validId(checkpointId), projectId });
  if (!checkpoint) throw new AppError(404, "This checkpoint was not found in your workspace.");
  const risk = await manager.findOneByOrFail(RiskEntity, { id: checkpoint.riskId, projectId });
  return { ...checkpoint, ...riskFields(risk) };
}
export async function updateCheckpoint(ctx: ApiContext, projectId: string, checkpointId: string, input: z.infer<typeof updateCheckpointSchema>) {
  return withOperation(ctx, projectId, async (operationId) => {
    await commit(ctx, projectId, operationId, async (manager) => {
      const c = await ownedCheckpoint(manager, projectId, checkpointId);
      const before = { status: c.status, disposition: c.disposition, owner: c.owner, completedAt: c.completedAt };
      if (input.status === "evidence_reviewed" && c.status !== "evidence_reviewed") throw new AppError(400, "Review supplied evidence before choosing this status.");
      if (input.status === "founder_confirmed") {
        const evidence = await manager.findOne(EvidenceEntity, { where: { checkpointId }, order: { createdAt: "DESC" } });
        const review = evidence && await manager.findOne(ReviewEntity, { where: { checkpointId, evidenceId: evidence.id }, order: { createdAt: "DESC" } });
        if (!review || JSON.stringify(review.criteria) !== JSON.stringify(c.acceptanceCriteria)) throw new AppError(400, "Add evidence and review it against the current criteria before confirming completion.");
        const reopened = await manager.findOne(EventEntity, { where: { checkpointId, type: In(["checkpoint_reopened", "checkpoint_updated_and_reopened"]) }, order: { createdAt: "DESC" } });
        if (reopened && review.createdAt <= reopened.createdAt) throw new AppError(400, "Review the evidence again after this checkpoint was reopened, then confirm the current work.");
        if ((input.disposition ?? c.disposition) !== "active") throw new AppError(400, "A deferred or accepted risk cannot be confirmed as complete. Set it active first.");
      }
      if (input.owner !== undefined) c.owner = input.owner;
      if (input.status) { c.status = input.status; c.completedAt = input.status === "founder_confirmed" ? new Date() : null; }
      if (input.disposition) {
        if (input.disposition === "active" && c.disposition !== "active" && c.status === "founder_confirmed" && input.status !== "founder_confirmed") { c.status = "evidence_reviewed"; c.completedAt = null; }
        c.disposition = input.disposition; c.dispositionReason = input.reason;
      }
      if (input.reviewDate !== undefined) {
        c.reviewDate = input.reviewDate;
        await manager.update(TriggerEntity, { checkpointId, description: "Scheduled review", resolvedAt: IsNull() }, { resolvedAt: new Date() });
        if (input.reviewDate) await manager.insert(TriggerEntity, { id: randomUUID(), projectId, checkpointId, description: "Scheduled review", dueAt: new Date(`${input.reviewDate}T00:00:00Z`), resolvedAt: null });
      }
      if (input.status === "founder_confirmed") await manager.createQueryBuilder().update(TriggerEntity).set({ resolvedAt: new Date() }).where('"checkpointId" = :checkpointId AND "dueAt" <= now() AND "resolvedAt" IS NULL', { checkpointId }).execute();
      await manager.save(CheckpointEntity, c);
      await audit(manager, projectId, checkpointId, "founder_updated", { before, after: { status: c.status, disposition: c.disposition, owner: c.owner }, reason: input.reason, reviewDate: input.reviewDate ?? null });
    });
    return projectDetail(ctx, projectId);
  });
}
export async function addEvidence(ctx: ApiContext, projectId: string, checkpointId: string, input: z.infer<typeof evidenceInputSchema>) {
  return withOperation(ctx, projectId, async (operationId) => {
    await commit(ctx, projectId, operationId, async (manager) => {
      const c = await ownedCheckpoint(manager, projectId, checkpointId);
      if (await manager.count(EvidenceEntity, { where: { checkpointId } }) >= 30) throw new AppError(429, "This checkpoint has reached its 30-evidence-note limit.");
      const evidenceId = randomUUID();
      await manager.insert(EvidenceEntity, { ...input, id: evidenceId, checkpointId, kind: "reported", reviewer: "" });
      await manager.update(CheckpointEntity, c.id, { status: "implemented_unverified", completedAt: null });
      await audit(manager, projectId, checkpointId, "evidence_submitted", { evidenceId, previousStatus: c.status, source: input.source });
    });
    return projectDetail(ctx, projectId);
  });
}
export async function checkpointAction(ctx: ApiContext, projectId: string, checkpointId: string, input: z.infer<typeof checkpointActionSchema>) {
  return withOperation(ctx, projectId, async (operationId) => {
    const checkpoint = await ownedCheckpoint(ctx.db.manager, projectId, checkpointId);
    const context = await aiContext(ctx, projectId);
    if (input.action === "prompt") {
      await consumeBudget(ctx);
      const { prompt } = await advisor.generateEngineeringPrompt({ ...context, checkpoint });
      await commit(ctx, projectId, operationId, async (manager) => {
        await manager.update(CheckpointEntity, checkpointId, { engineeringPrompt: prompt });
        await audit(manager, projectId, checkpointId, "prompt_generated", { prompt });
      });
    } else {
      const evidence = await ctx.db.manager.findOneBy(EvidenceEntity, { id: input.evidenceId, checkpointId });
      if (!evidence) throw new AppError(404, "Evidence was not found in this checkpoint.");
      await consumeBudget(ctx);
      const review = await advisor.reviewEvidence({ checkpoint, evidence, facts: context.facts });
      const indexes = new Set(review.findings.map((f) => f.criterionIndex));
      if (indexes.size !== checkpoint.acceptanceCriteria.length || review.findings.length !== indexes.size || [...indexes].some((i) => i >= checkpoint.acceptanceCriteria.length)) throw new AppError(502, "The review did not cover every criterion. Retry; the original evidence is saved.");
      await commit(ctx, projectId, operationId, async (manager) => {
        const reviewId = randomUUID();
        await manager.insert(ReviewEntity, { ...review, id: reviewId, checkpointId, evidenceId: evidence.id, criteria: checkpoint.acceptanceCriteria });
        await manager.update(CheckpointEntity, checkpointId, { status: "evidence_reviewed", completedAt: null });
        await audit(manager, projectId, checkpointId, "evidence_reviewed", { reviewId, evidenceId: evidence.id });
      });
    }
    return projectDetail(ctx, projectId);
  });
}
