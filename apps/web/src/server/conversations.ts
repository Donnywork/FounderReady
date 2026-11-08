import "server-only";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { EntityManager } from "typeorm";
import type { z } from "zod";
import { checkpointDraftSchema, coverageReviewSchema, domains, factSchema, type Operation, type conversationInputSchema, type proposalDecisionSchema, type proposalDraftSchema } from "@/lib/contracts";
import { advisor } from "./ai/advisor";
import { AppError, type ApiContext, validId } from "./http";
import { CheckpointEntity, ConversationEntity, FactEntity, MessageEntity, ProposalEntity, RelationEntity, RiskEntity } from "./db/entities";
import { aiContext, commit, consumeBudget, message, ownedCheckpoint, ownedProject, projectDetail, withOperation } from "./projects";
import { audit, saveCheckpoint, saveRelation, riskFields } from "./state";

async function snapshot(manager: EntityManager, projectId: string, operation: Operation): Promise<object | null> {
  if (operation.type === "set_fact") {
    const fact = await manager.findOneBy(FactEntity, { projectId, key: operation.fact.key });
    return fact ? factSchema.parse(fact) : null;
  }
  if (operation.type === "relate_risks") {
    const from = await manager.findOneBy(RiskEntity, { projectId, key: operation.relation.fromKey });
    const to = await manager.findOneBy(RiskEntity, { projectId, key: operation.relation.toKey });
    const relation = from && to && await manager.findOneBy(RelationEntity, { projectId, fromRiskId: from.id, toRiskId: to.id, type: operation.relation.type });
    return relation ? operation.relation : null;
  }
  const key = operation.type === "reopen_checkpoint" ? operation.key : operation.checkpoint.key;
  const c = await manager.findOneBy(CheckpointEntity, { projectId, key });
  if (!c) return null;
  const risk = await manager.findOneByOrFail(RiskEntity, { id: c.riskId, projectId });
  return { ...checkpointDraftSchema.parse({ ...c, ...riskFields(risk) }), status: c.status, disposition: c.disposition, owner: c.owner, completedAt: c.completedAt?.toISOString() ?? null };
}
async function propose(manager: EntityManager, projectId: string, conversationId: string, messageId: string, drafts: z.infer<typeof proposalDraftSchema>[]) {
  const pending = await manager.find(ProposalEntity, { where: [{ projectId, state: "pending" }, { projectId, state: "deferred" }] });
  if (pending.length + drafts.length > 60) throw new AppError(429, "Review existing proposed updates before requesting more.");
  const createdKeys = new Set(drafts.flatMap((d) => d.operation.type === "create_checkpoint" ? [d.operation.checkpoint.key] : []));
  for (const draft of drafts) {
    let operation = draft.operation;
    const before = await snapshot(manager, projectId, operation);
    if ((operation.type === "reopen_checkpoint" || operation.type === "update_checkpoint") && !before) throw new AppError(502, "The advisor referenced an unknown checkpoint. Retry this conversation.");
    if (operation.type === "create_checkpoint" && before) {
      if (isDeepStrictEqual(checkpointDraftSchema.parse(before), operation.checkpoint)) continue;
      // The founder reviews an explicit update, including its current snapshot.
      operation = { type: "update_checkpoint", checkpoint: operation.checkpoint };
    }
    if (operation.type === "relate_risks") {
      for (const key of [operation.relation.fromKey, operation.relation.toKey]) if (!createdKeys.has(key) && !await manager.existsBy(RiskEntity, { projectId, key })) throw new AppError(502, "The advisor referenced an unknown risk. Retry this conversation.");
    }
    if (pending.some((p) => isDeepStrictEqual(p.operation, operation))) continue;
    if (operation.type === "create_checkpoint") {
      const candidate = operation.checkpoint;
      if (pending.some((p) => p.operation.type === "create_checkpoint" && (p.operation.checkpoint.key === candidate.key || p.operation.checkpoint.title.toLowerCase() === candidate.title.toLowerCase()))) continue;
    }
    const proposal = { id: randomUUID(), projectId, conversationId, messageId, rationale: draft.rationale, operation, before, state: "pending" as const, decisionReason: "", decidedAt: null };
    await manager.save(ProposalEntity, proposal);
    pending.push({ ...proposal, createdAt: new Date() });
    await audit(manager, projectId, null, "change_proposed", { proposalId: proposal.id, operation });
  }
}
export async function conversationAction(ctx: ApiContext, projectId: string, input: z.infer<typeof conversationInputSchema>) {
  return withOperation(ctx, projectId, async (operationId) => {
    if ((await ownedProject(ctx, projectId)).phase !== "workspace") throw new AppError(409, "Approve your initial project profile first.");
    if (input.action === "create") {
      let conversationId: string = randomUUID();
      await commit(ctx, projectId, operationId, async (manager) => {
        const checkpoint = input.checkpointId ? await ownedCheckpoint(manager, projectId, input.checkpointId) : null;
        const empty = await manager.createQueryBuilder(ConversationEntity, "conversation")
          .leftJoin("messages", "message", 'message."conversationId" = conversation.id')
          .where("conversation.projectId = :projectId", { projectId })
          .andWhere("conversation.kind = :kind", { kind: "chat" })
          .andWhere("conversation.checkpointId IS NOT DISTINCT FROM :checkpointId", { checkpointId: input.checkpointId })
          .andWhere("conversation.exploration IS NOT DISTINCT FROM CAST(:exploration AS jsonb)", { exploration: input.exploration ? JSON.stringify(input.exploration) : null })
          .andWhere("message.id IS NULL")
          .orderBy("conversation.createdAt", "DESC").addOrderBy("conversation.id", "DESC")
          .limit(1).getOne();
        if (empty) { conversationId = empty.id; return; }
        if (await manager.count(ConversationEntity, { where: { projectId } }) >= 60) throw new AppError(429, "This project has reached its 60-conversation limit.");
        const id = conversationId;
        const titles = { security: "Exploring security & privacy risks", reliability: "Exploring reliability risks", ai: "Reviewing AI blind spots", cost: "Exploring cost & scalability risks" };
        const title = input.exploration ? input.exploration.domain ? titles[input.exploration.domain] : "What are we missing before launch?" : checkpoint ? `About: ${checkpoint.title}` : "New conversation";
        await manager.insert(ConversationEntity, { id, projectId, kind: "chat", title, checkpointId: checkpoint?.id ?? null, exploration: input.exploration });
        if (input.exploration) await message(manager, id, "user", input.exploration.domain
          ? `Help me explore ${domains[input.exploration.domain]} for this project. What might our current assessment be missing, and what should we investigate?`
          : "Help me explore what our current readiness assessment might be missing. Consider our product, architecture, target users and launch plans, including concerns outside the risks already identified.");
      });
      return { ...await projectDetail(ctx, projectId), conversationId };
    }
    const conversation = await ctx.db.manager.findOneBy(ConversationEntity, { id: input.conversationId, projectId });
    if (!conversation || conversation.kind === "interview") throw new AppError(404, "This conversation is not available in your project.");
    let messages = await ctx.db.manager.find(MessageEntity, { where: { conversationId: conversation.id }, order: { createdAt: "ASC" } });
    if (input.action === "send") {
      if (messages.at(-1)?.role === "user") throw new AppError(409, "Retry the saved message before sending another.");
      if (messages.length >= 100) throw new AppError(429, "Start a new conversation to continue with the same project context.");
      await commit(ctx, projectId, operationId, async (manager) => {
        await message(manager, conversation.id, "user", input.content);
        if (!messages.length && !conversation.checkpointId) await manager.update(ConversationEntity, conversation.id, { title: input.content.slice(0, 70) });
      });
      messages = await ctx.db.manager.find(MessageEntity, { where: { conversationId: conversation.id }, order: { createdAt: "ASC" } });
    } else if (messages.at(-1)?.role !== "user") return projectDetail(ctx, projectId);
    const project = conversation.exploration ? await projectDetail(ctx, projectId) : null;
    const context = { ...await aiContext(ctx, projectId), thread: messages.slice(-30).map(({ role, content }) => ({ role, content })), checkpointId: conversation.checkpointId,
      ...(project ? { exploration: conversation.exploration,
        recentConversations: project.conversations.filter((c) => c.id !== conversation.id && c.kind !== "interview").sort((a, b) =>
          Number(b.exploration?.domain === conversation.exploration?.domain) - Number(a.exploration?.domain === conversation.exploration?.domain) || b.createdAt.localeCompare(a.createdAt)).slice(0, 5)
          .map((c) => ({ title: c.title, exploration: c.exploration, messages: c.messages.slice(-6).map(({ role, content }) => ({ role, content })) })),
        proposalDecisions: project.proposals.slice(-30).map((p) => ({ operation: p.operation, state: p.state, reason: p.decisionReason })),
      } : {}),
    };
    await consumeBudget(ctx);
    const response = conversation.exploration ? await advisor.respondToConversation(context, true) : await advisor.respondToConversation(context);
    let drafts = response.proposals;
    let content = response.answer;
    if (response.followup) content += `\n\n${response.followup}`;
    if (response.materialChange) {
      await consumeBudget(ctx);
      const impact = await advisor.analyzeChangeImpact({ ...context, reportedChange: response.materialChange });
      drafts = impact.proposals;
      content += `\n\nImpact review: ${impact.summary}`;
    }
    await commit(ctx, projectId, operationId, async (manager) => {
      const messageId = await message(manager, conversation.id, "assistant", content);
      await propose(manager, projectId, conversation.id, messageId, drafts);
      if (conversation.exploration && !response.materialChange && "coverage" in response) {
        const reviews = coverageReviewSchema.array().max(4).parse(response.coverage);
        if (new Set(reviews.map((r) => r.domain)).size !== reviews.length) throw new AppError(502, "The advisor repeated an assessment area. Retry the saved message.");
        for (const review of reviews) {
          const hasProposal = drafts.some((d) => (d.operation.type === "create_checkpoint" || d.operation.type === "update_checkpoint") && d.operation.checkpoint.domain === review.domain);
          if (review.outcome === "assessed_no_risks" && hasProposal) throw new AppError(502, "The advisor returned conflicting findings for an assessment area. Retry the saved message.");
          await audit(manager, projectId, null, "area_explored", { ...review, conversationId: conversation.id, messageId });
        }
      }
    });
    return projectDetail(ctx, projectId);
  });
}
export async function decideProposal(ctx: ApiContext, projectId: string, proposalId: string, input: z.infer<typeof proposalDecisionSchema>) {
  return withOperation(ctx, projectId, async (operationId) => {
    // Check the current persisted map under the project lease. Never merge into an
    // existing checkpoint without showing the founder an explicit update proposal.
    const candidate = await ctx.db.manager.findOneBy(ProposalEntity, { id: validId(proposalId), projectId });
    if (input.decision === "approved" && candidate && (candidate.state === "pending" || candidate.state === "deferred") && candidate.operation.type === "create_checkpoint") {
      const draft = candidate.operation.checkpoint;
      const existing = (await projectDetail(ctx, projectId)).checkpoints;
      const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
      let overlap = existing.find((c) => c.key === draft.key || normalize(c.title) === normalize(draft.title) || normalize(c.risk) === normalize(draft.risk) || normalize(c.action) === normalize(draft.action));
      if (!overlap && existing.length) {
        await consumeBudget(ctx);
        const result = await advisor.checkRiskOverlap({ proposedCheckpoint: draft, existingCheckpoints: existing.map((c) => checkpointDraftSchema.parse(c)) });
        if (result.existingKey) {
          overlap = existing.find((c) => c.key === result.existingKey);
          if (!overlap) throw new AppError(502, "The overlap check referenced an unknown risk. Retry approval; nothing has been added.");
        }
      }
      if (overlap) throw new AppError(409, `This overlaps with “${overlap.title}”. Keep discussing and ask the advisor to update that checkpoint instead. Nothing has been added.`);
    }
    await commit(ctx, projectId, operationId, async (manager) => {
      const proposal = await manager.findOneBy(ProposalEntity, { id: validId(proposalId), projectId });
      if (!proposal) throw new AppError(404, "This proposal is not in your project.");
      if (proposal.state === "approved" || proposal.state === "rejected") {
        if (proposal.state === input.decision) return;
        throw new AppError(409, "This proposal has already been decided.");
      }
      const operation = proposal.operation;
      if (input.decision === "approved") {
        const current = await snapshot(manager, projectId, operation);
        if (!isDeepStrictEqual(current, proposal.before)) throw new AppError(409, "This item changed since the proposal. Reject it and ask for an updated proposal so newer work is preserved.");
        switch (operation.type) {
          case "set_fact": {
            const existing = await manager.findOneBy(FactEntity, { projectId, key: operation.fact.key });
            await manager.save(FactEntity, { ...operation.fact, id: existing?.id ?? randomUUID(), projectId, confirmedAt: operation.fact.provenance === "founder_reported" ? new Date() : null });
            break;
          }
          case "create_checkpoint": case "update_checkpoint": await saveCheckpoint(manager, projectId, operation.checkpoint, { proposalId, conversationId: proposal.conversationId, messageId: proposal.messageId }); break;
          case "reopen_checkpoint": {
            const c = await manager.findOneByOrFail(CheckpointEntity, { projectId, key: operation.key });
            await manager.update(CheckpointEntity, c.id, { status: "needs_action", completedAt: null, engineeringPrompt: "" });
            await audit(manager, projectId, c.id, "checkpoint_reopened", { previousStatus: c.status, previousConfirmation: c.completedAt, reason: operation.reason, proposalId });
            break;
          }
          case "relate_risks": await saveRelation(manager, projectId, operation.relation); break;
        }
      }
      const previousState = proposal.state;
      proposal.state = input.decision; proposal.decidedAt = new Date(); proposal.decisionReason = input.reason;
      await manager.save(ProposalEntity, proposal);
      await audit(manager, projectId, null, `proposal_${input.decision}`, { proposalId, previousState, operation, reason: input.reason, conversationId: proposal.conversationId, messageId: proposal.messageId });
    });
    return projectDetail(ctx, projectId);
  });
}
