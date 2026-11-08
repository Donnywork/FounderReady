import "server-only";
import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { EntityManager } from "typeorm";
import type { z } from "zod";
import { checkpointDraftSchema, factSchema, type Operation, type conversationInputSchema, type proposalDecisionSchema, type proposalDraftSchema } from "@/lib/contracts";
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
    const operation = draft.operation;
    const before = await snapshot(manager, projectId, operation);
    if ((operation.type === "reopen_checkpoint" || operation.type === "update_checkpoint") && !before) throw new AppError(502, "The advisor referenced an unknown checkpoint. Retry this conversation.");
    if (operation.type === "create_checkpoint" && before) {
      // An exact existing key is never created twice. Ask the model to propose an explicit update.
      continue;
    }
    if (operation.type === "relate_risks") {
      for (const key of [operation.relation.fromKey, operation.relation.toKey]) if (!createdKeys.has(key) && !await manager.existsBy(RiskEntity, { projectId, key })) throw new AppError(502, "The advisor referenced an unknown risk. Retry this conversation.");
    }
    if (pending.some((p) => isDeepStrictEqual(p.operation, operation))) continue;
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
      await commit(ctx, projectId, operationId, async (manager) => {
        if (await manager.count(ConversationEntity, { where: { projectId } }) >= 60) throw new AppError(429, "This project has reached its 60-conversation limit.");
        const checkpoint = input.checkpointId ? await ownedCheckpoint(manager, projectId, input.checkpointId) : null;
        await manager.insert(ConversationEntity, { id: randomUUID(), projectId, kind: "chat", title: checkpoint ? `About: ${checkpoint.title}` : "New conversation", checkpointId: checkpoint?.id ?? null });
      });
      return projectDetail(ctx, projectId);
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
    const context = { ...await aiContext(ctx, projectId), thread: messages.slice(-30).map(({ role, content }) => ({ role, content })), checkpointId: conversation.checkpointId };
    await consumeBudget(ctx);
    const response = await advisor.respondToConversation(context);
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
    });
    return projectDetail(ctx, projectId);
  });
}
export async function decideProposal(ctx: ApiContext, projectId: string, proposalId: string, input: z.infer<typeof proposalDecisionSchema>) {
  return withOperation(ctx, projectId, async (operationId) => {
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
          case "create_checkpoint": case "update_checkpoint": await saveCheckpoint(manager, projectId, operation.checkpoint); break;
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
      await audit(manager, projectId, null, `proposal_${input.decision}`, { proposalId, previousState, operation, reason: input.reason });
    });
    return projectDetail(ctx, projectId);
  });
}
