import "server-only";
import { randomUUID } from "node:crypto";
import { IsNull, type EntityManager } from "typeorm";
import type { z } from "zod";
import type { CheckpointDraft, relationDraftSchema } from "@/lib/contracts";
import { AppError } from "./http";
import { CheckpointEntity, EventEntity, RiskEntity, RelationEntity, TriggerEntity, type RiskRow } from "./db/entities";

export function riskFields(risk: RiskRow) {
  return { risk: risk.explanation, domain: risk.domain, uncertainty: risk.uncertainty, legalFlag: risk.legalFlag };
}

export async function audit(manager: EntityManager, projectId: string, checkpointId: string | null, type: string, detail: Record<string, unknown>) {
  await manager.save(EventEntity, { id: randomUUID(), projectId, checkpointId, type, detail });
}
export async function saveCheckpoint(manager: EntityManager, projectId: string, draft: CheckpointDraft) {
  const existing = await manager.findOneBy(CheckpointEntity, { projectId, key: draft.key });
  const duplicate = await manager.getRepository(CheckpointEntity).createQueryBuilder("c").where('c."projectId" = :projectId AND lower(c.title) = lower(:title)', { projectId, title: draft.title }).getOne();
  if (duplicate && duplicate.key !== draft.key) throw new AppError(409, "This checkpoint already exists with a different key. Ask the advisor to update the existing checkpoint.");
  const riskId = existing?.riskId ?? randomUUID();
  const id = existing?.id ?? randomUUID();
  await manager.save(RiskEntity, { id: riskId, projectId, key: draft.key, domain: draft.domain, title: draft.title, explanation: draft.risk, uncertainty: draft.uncertainty, legalFlag: draft.legalFlag });
  if (!existing && await manager.count(CheckpointEntity, { where: { projectId } }) >= 60) throw new AppError(429, "This project has reached its 60-checkpoint limit.");
  const position = existing?.position ?? await manager.count(CheckpointEntity, { where: { projectId } });
  await manager.save(CheckpointEntity, { ...existing, ...draft, id, projectId, riskId, position, owner: existing?.owner ?? "", status: "needs_action", disposition: existing?.disposition ?? "active", dispositionReason: existing?.dispositionReason ?? "", engineeringPrompt: "", completedAt: null });
  // Supersede triggers without losing their prior dates or the history that introduced them.
  await manager.update(TriggerEntity, { checkpointId: id, resolvedAt: IsNull() }, { resolvedAt: new Date() });
  for (const description of draft.reviewTriggers) await manager.insert(TriggerEntity, { id: randomUUID(), projectId, checkpointId: id, description, dueAt: null, resolvedAt: null });
  if (draft.reviewDate) await manager.insert(TriggerEntity, { id: randomUUID(), projectId, checkpointId: id, description: "Scheduled review", dueAt: new Date(`${draft.reviewDate}T00:00:00Z`), resolvedAt: null });
  await audit(manager, projectId, id, existing ? "checkpoint_updated_and_reopened" : "checkpoint_created", { before: existing ?? null, after: draft });
  return id;
}
export async function saveRelation(manager: EntityManager, projectId: string, draft: z.infer<typeof relationDraftSchema>) {
  const from = await manager.findOneBy(RiskEntity, { projectId, key: draft.fromKey });
  const to = await manager.findOneBy(RiskEntity, { projectId, key: draft.toKey });
  if (!from || !to || from.id === to.id) throw new AppError(409, "Approve the referenced checkpoints first, then retry this relationship.");
  const where = { projectId, fromRiskId: from.id, toRiskId: to.id, type: draft.type };
  if (!await manager.existsBy(RelationEntity, where)) await manager.insert(RelationEntity, { id: randomUUID(), ...where });
}
