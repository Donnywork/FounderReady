import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRootEnv } from "../env.cjs";
import type { DataSource } from "typeorm";
import { readiness, type ProjectDetail } from "@/lib/contracts";
import { readinessGraph } from "@/lib/graph";
import { makeDataSource } from "@/server/db/data-source";
import { advisor } from "@/server/ai/advisor";
import { AppError } from "@/server/http";
import { GuestEntity, ProjectEntity } from "@/server/db/entities";
import { GET as list, POST as create } from "@/app/api/projects/route";
import { GET as detail } from "@/app/api/projects/[id]/route";
import { POST as interview } from "@/app/api/projects/[id]/interview/route";
import { POST as profileUpdate } from "@/app/api/projects/[id]/profile/route";
import { POST as chat } from "@/app/api/projects/[id]/conversations/route";
import { POST as decide } from "@/app/api/projects/[id]/proposals/[proposalId]/route";
import { PATCH as update } from "@/app/api/projects/[id]/checkpoints/[checkpointId]/route";
import { POST as evidence } from "@/app/api/projects/[id]/checkpoints/[checkpointId]/evidence/route";
import { POST as action } from "@/app/api/projects/[id]/checkpoints/[checkpointId]/actions/route";
import { assessment, question, profile, evidenceReview, stripeImpact, engineeringPrompt, demoDescription } from "./fixtures";

loadRootEnv();
const url = process.env.TEST_DATABASE_URL;
let db: DataSource;
const globalDb = globalThis as unknown as { founderReadyDb?: Promise<DataSource> };
function req(cookie = "", body?: unknown, method = "POST") {
  return new Request("http://localhost:3000/api/projects", { method: body === undefined ? "GET" : method, headers: { cookie, origin: "http://localhost:3000", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const cpParams = (id: string, checkpointId: string) => ({ params: Promise.resolve({ id, checkpointId }) });
const propParams = (id: string, proposalId: string) => ({ params: Promise.resolve({ id, proposalId }) });
async function body(response: Response): Promise<ProjectDetail> {
  const value = await response.json();
  expect(response.status, JSON.stringify(value)).toBe(200);
  return value;
}
async function newProject(cookie = "") {
  const response = await create(req(cookie, { description: demoDescription }));
  expect(response.status).toBe(200);
  const { project } = await response.json();
  return { id: project.id as string, cookie: cookie || response.headers.get("set-cookie")!.split(";")[0] };
}
async function workspace() {
  const session = await newProject();
  await body(await interview(req(session.cookie, { action: "finish" }), params(session.id)));
  const project = await body(await profileUpdate(req(session.cookie, { ...profile, approve: true }), params(session.id)));
  return { ...session, project };
}
async function stripeChat(id: string, cookie: string) {
  const created = await body(await chat(req(cookie, { action: "create" }), params(id)));
  return body(await chat(req(cookie, { action: "send", conversationId: created.conversations.at(-1)!.id, content: "I just added Stripe subscriptions." }), params(id)));
}
async function reviewedCheckpoint(id: string, cookie: string, checkpointId: string) {
  const saved = await body(await evidence(req(cookie, { content: "Codex says done. No output was supplied.", source: "Coding-agent report" }), cpParams(id, checkpointId)));
  const evidenceId = saved.checkpoints.find((c) => c.id === checkpointId)!.evidence[0].id;
  return body(await action(req(cookie, { action: "review", evidenceId }), cpParams(id, checkpointId)));
}

describe.skipIf(!url)("API routes with PostgreSQL and a deterministic advisor", () => {
  beforeAll(async () => {
    if (!new URL(url!).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL must name a disposable database ending in _test.");
    db = await makeDataSource(url).initialize(); await db.runMigrations(); globalDb.founderReadyDb = Promise.resolve(db);
  });
  beforeEach(async () => {
    vi.restoreAllMocks(); await db.query("TRUNCATE guests CASCADE");
    vi.spyOn(advisor, "nextInterviewQuestion").mockResolvedValue({ question });
    vi.spyOn(advisor, "proposeProjectProfile").mockResolvedValue(profile);
    vi.spyOn(advisor, "assessRisks").mockResolvedValue(assessment);
    vi.spyOn(advisor, "generateEngineeringPrompt").mockResolvedValue({ prompt: engineeringPrompt });
    vi.spyOn(advisor, "reviewEvidence").mockResolvedValue(evidenceReview);
    vi.spyOn(advisor, "respondToConversation").mockResolvedValue({ answer: "Stripe adds payment state and access rules. I’ll propose focused checks for your review.", followup: null, materialChange: "Added Stripe subscriptions", proposals: [] });
    vi.spyOn(advisor, "analyzeChangeImpact").mockResolvedValue(stripeImpact);
  });
  afterAll(async () => { vi.restoreAllMocks(); globalDb.founderReadyDb = undefined; if (db?.isInitialized) await db.destroy(); });

  it("isolates guests, projects, conversations, checkpoints, evidence and proposals", async () => {
    const first = await workspace(); const outsider = await newProject(); const other = await newProject(first.cookie);
    expect((await detail(req(outsider.cookie), params(first.id))).status).toBe(404);
    expect((await detail(req(), params(first.id))).status).toBe(401);
    const cp = first.project.checkpoints[0].id;
    expect((await evidence(req(outsider.cookie, { content: "An attempted cross-session write", source: "test" }), cpParams(first.id, cp))).status).toBe(404);
    expect((await evidence(req(first.cookie, { content: "An attempted cross-project write", source: "test" }), cpParams(other.id, cp))).status).toBe(404);
    const proposed = await stripeChat(first.id, first.cookie);
    expect((await decide(req(outsider.cookie, { decision: "approved" }), propParams(first.id, proposed.proposals[0].id))).status).toBe(404);
    const otherWorkspace = await workspace();
    expect((await chat(req(otherWorkspace.cookie, { action: "send", conversationId: proposed.conversations.at(-1)!.id, content: "hello" }), params(otherWorkspace.id))).status).toBe(404);
    const ownList = await (await list(req(outsider.cookie))).json();
    expect(ownList.projects.map((p: { id: string }) => p.id)).toEqual([outsider.id]); expect(JSON.stringify(ownList)).not.toContain("guestId");
  });
  it("caps the interview at five and preserves unknown/skipped answers until profile approval", async () => {
    const { id, cookie } = await newProject();
    let project = await body(await interview(req(cookie, { action: "next" }), params(id)));
    const firstQuestion = project.pendingQuestion!.id;
    for (let i = 0; i < 5; i++) {
      project = await body(await interview(req(cookie, { action: "answer", response: { questionId: project.pendingQuestion!.id, disposition: i === 1 ? "skipped" : "unknown", answer: "" } }), params(id)));
      if (i === 0) expect((await interview(req(cookie, { action: "answer", response: { questionId: firstQuestion, disposition: "unknown" } }), params(id))).status).toBe(409);
    }
    expect(project.phase).toBe("profile"); expect(project.answeredCount).toBe(5); expect(project.checkpoints).toHaveLength(0);
    expect(project.facts.filter((f) => f.key.startsWith("unanswered-")).every((f) => f.provenance === "unknown")).toBe(true);
    expect(advisor.nextInterviewQuestion).toHaveBeenCalledTimes(5); expect(advisor.assessRisks).not.toHaveBeenCalled();
    project = await body(await profileUpdate(req(cookie, { ...profile, approve: true }), params(id)));
    expect(project.phase).toBe("workspace"); expect(project.checkpoints).toHaveLength(3);
    await body(await profileUpdate(req(cookie, { ...profile, approve: true }), params(id))); expect(advisor.assessRisks).toHaveBeenCalledTimes(1);
  });
  it("persists work across a new database connection", async () => {
    const { id, cookie, project } = await workspace();
    await db.destroy(); db = await makeDataSource(url).initialize(); globalDb.founderReadyDb = Promise.resolve(db);
    const reloaded = await body(await detail(req(cookie), params(id)));
    expect(reloaded.checkpoints.map((c) => c.id)).toEqual(project.checkpoints.map((c) => c.id)); expect(reloaded.facts).toEqual(project.facts);
  });
  it("retains answers and profile edits through provider failures", async () => {
    const { id, cookie } = await newProject();
    const first = await body(await interview(req(cookie, { action: "next" }), params(id)));
    vi.mocked(advisor.nextInterviewQuestion).mockRejectedValueOnce(new AppError(502, "Invalid structured response"));
    expect((await interview(req(cookie, { action: "answer", response: { questionId: first.pendingQuestion!.id, disposition: "unknown" } }), params(id))).status).toBe(502);
    const saved = await body(await detail(req(cookie), params(id))); expect(saved.answeredCount).toBe(1); expect(saved.pendingQuestion).toBeNull();
    await body(await interview(req(cookie, { action: "finish" }), params(id)));
    vi.mocked(advisor.assessRisks).mockRejectedValueOnce(new AppError(502, "Invalid structured response"));
    expect((await profileUpdate(req(cookie, { ...profile, title: "Edited title", approve: true }), params(id))).status).toBe(502);
    expect((await body(await detail(req(cookie), params(id)))).title).toBe("Edited title");
    expect((await body(await profileUpdate(req(cookie, { ...profile, approve: true }), params(id)))).checkpoints).toHaveLength(3);
  });
  it("reviews evidence without auto-confirming, requires explicit confirmation and preserves immutable history", async () => {
    const { id, cookie, project } = await workspace(); const checkpointId = project.checkpoints[0].id;
    const confirm = () => update(req(cookie, { status: "founder_confirmed", confirmCompletion: true }, "PATCH"), cpParams(id, checkpointId));
    expect((await confirm()).status).toBe(400);
    const reviewed = await reviewedCheckpoint(id, cookie, checkpointId); const cp = reviewed.checkpoints[0];
    expect(cp.status).toBe("evidence_reviewed"); expect(cp.completedAt).toBeNull(); expect(readiness(reviewed.checkpoints).complete).toBe(0);
    expect(cp.reviews[0].findings.every((f) => f.assessment !== "supported")).toBe(true);
    expect((await update(req(cookie, { status: "founder_confirmed" }, "PATCH"), cpParams(id, checkpointId))).status).toBe(400);
    const done = await body(await confirm()); expect(done.checkpoints[0].status).toBe("founder_confirmed");
    await expect(db.query('UPDATE evidence SET content = $1 WHERE id = $2', ["changed", cp.evidence[0].id])).rejects.toThrow("immutable");
    await expect(db.query('DELETE FROM checkpoint_events WHERE id = $1', [cp.events[0].id])).rejects.toThrow("immutable");
  });
  it("rejects incomplete criterion reviews and cross-checkpoint evidence references", async () => {
    const { id, cookie, project } = await workspace(); const checkpointId = project.checkpoints[0].id;
    const saved = await body(await evidence(req(cookie, { content: "Actual test output with details", source: "CI" }), cpParams(id, checkpointId))); const evidenceId = saved.checkpoints[0].evidence[0].id;
    vi.mocked(advisor.reviewEvidence).mockResolvedValueOnce({ ...evidenceReview, findings: [evidenceReview.findings[0], evidenceReview.findings[0]] });
    expect((await action(req(cookie, { action: "review", evidenceId }), cpParams(id, checkpointId))).status).toBe(502);
    expect((await action(req(cookie, { action: "review", evidenceId }), cpParams(id, project.checkpoints[1].id))).status).toBe(404);
    expect((await body(await detail(req(cookie), params(id)))).checkpoints[0].reviews).toHaveLength(0);
  });
  it("never counts risk acceptance or deferral as verification and retains priority", async () => {
    const { id, cookie, project } = await workspace(); const checkpointId = project.checkpoints[0].id;
    expect((await update(req(cookie, { disposition: "risk_accepted" }, "PATCH"), cpParams(id, checkpointId))).status).toBe(400);
    const accepted = await body(await update(req(cookie, { disposition: "risk_accepted", reason: "Limited synthetic-data trial with documented exposure." }, "PATCH"), cpParams(id, checkpointId)));
    expect(accepted.checkpoints[0].priority).toBe("P0"); expect(accepted.checkpoints[0].status).toBe("needs_action"); expect(readiness(accepted.checkpoints).complete).toBe(0);
    await body(await update(req(cookie, { disposition: "active" }, "PATCH"), cpParams(id, checkpointId)));
    await reviewedCheckpoint(id, cookie, checkpointId);
    await body(await update(req(cookie, { status: "founder_confirmed", confirmCompletion: true }, "PATCH"), cpParams(id, checkpointId)));
    await body(await update(req(cookie, { disposition: "deferred", reason: "Revisit this decision after changing the data policy." }, "PATCH"), cpParams(id, checkpointId)));
    const active = await body(await update(req(cookie, { disposition: "active" }, "PATCH"), cpParams(id, checkpointId)));
    expect(readiness(active.checkpoints).complete).toBe(0);
  });
  it("keeps conversation changes pending, approves/rejects individually, and synchronizes graph/checklist", async () => {
    const { id, cookie, project } = await workspace(); const proposed = await stripeChat(id, cookie);
    expect(proposed.proposals).toHaveLength(3); expect(proposed.checkpoints).toHaveLength(3); expect(proposed.risks).toHaveLength(3); expect(proposed.facts).toEqual(project.facts);
    await body(await decide(req(cookie, { decision: "rejected", reason: "I need to correct this description." }), propParams(id, proposed.proposals[0].id)));
    const approved = await body(await decide(req(cookie, { decision: "approved" }), propParams(id, proposed.proposals[1].id)));
    expect(approved.checkpoints).toHaveLength(4); expect(approved.risks).toHaveLength(4);
    for (const cp of approved.checkpoints) expect(approved.risks.find((r) => r.id === cp.riskId)).toMatchObject({ key: cp.key, domain: cp.domain, explanation: cp.risk });
    const graph = readinessGraph(approved);
    expect(graph.checkpointNodes.map((n) => n.resourceId)).toEqual(approved.checkpoints.map((c) => c.id));
    expect(graph.edges.filter((e) => e.type === "contains")).toHaveLength(8);
    expect(graph.domainNodes.reduce((count, n) => count + n.progress.total, 0)).toBe(approved.checkpoints.length);
    const repeated = await body(await decide(req(cookie, { decision: "approved" }), propParams(id, proposed.proposals[1].id))); expect(repeated.checkpoints).toHaveLength(4);
    const deferred = await body(await decide(req(cookie, { decision: "deferred" }), propParams(id, proposed.proposals[2].id))); expect(deferred.proposals.find((p) => p.id === proposed.proposals[2].id)!.state).toBe("deferred");
    expect(deferred.events.some((e) => e.type === "proposal_rejected")).toBe(true);
  });
  it("reopens approved affected checkpoints while preserving evidence and confirmations", async () => {
    const { id, cookie, project } = await workspace(); const cp = project.checkpoints.find((c) => c.key === "ai-spend-limits")!;
    await reviewedCheckpoint(id, cookie, cp.id);
    await body(await update(req(cookie, { status: "founder_confirmed", confirmCompletion: true }, "PATCH"), cpParams(id, cp.id)));
    const proposed = await stripeChat(id, cookie); expect(proposed.checkpoints.find((c) => c.id === cp.id)!.status).toBe("founder_confirmed");
    const reopened = await body(await decide(req(cookie, { decision: "approved" }), propParams(id, proposed.proposals[2].id)));
    const updated = reopened.checkpoints.find((c) => c.id === cp.id)!; expect(updated.status).toBe("needs_action"); expect(updated.evidence).toHaveLength(1); expect(updated.reviews).toHaveLength(1);
    expect(updated.events.some((e) => e.type === "founder_updated" && (e.detail.after as { status: string }).status === "founder_confirmed")).toBe(true);
    expect(updated.events.at(-1)?.type).toBe("checkpoint_reopened");
    expect((await update(req(cookie, { status: "founder_confirmed", confirmCompletion: true }, "PATCH"), cpParams(id, cp.id))).status).toBe(400);
  });
  it("deduplicates repeated proposed changes and rejects stale approvals", async () => {
    const { id, cookie } = await workspace(); const proposed = await stripeChat(id, cookie);
    await stripeChat(id, cookie);
    expect((await body(await detail(req(cookie), params(id)))).proposals).toHaveLength(3);
    await body(await profileUpdate(req(cookie, { ...profile, facts: profile.facts.map((f) => f.key === "stack-integrations" ? { ...f, value: "A corrected stack" } : f), approve: false }), params(id)));
    expect((await decide(req(cookie, { decision: "approved" }), propParams(id, proposed.proposals[0].id))).status).toBe(409);
  });
  it("answers direct questions and resumes failed messages without a new interview", async () => {
    const { id, cookie } = await workspace(); const created = await body(await chat(req(cookie, { action: "create" }), params(id))); const conversationId = created.conversations.at(-1)!.id;
    vi.mocked(advisor.respondToConversation).mockRejectedValueOnce(new AppError(502, "Provider unavailable"));
    expect((await chat(req(cookie, { action: "send", conversationId, content: "What is prompt injection?" }), params(id))).status).toBe(502);
    vi.mocked(advisor.respondToConversation).mockResolvedValue({ answer: "Prompt injection is text that tries to redirect your AI away from its intended task.", followup: null, materialChange: null, proposals: [] });
    const resumed = await body(await chat(req(cookie, { action: "retry", conversationId }), params(id)));
    expect(resumed.conversations.at(-1)!.messages).toHaveLength(2); expect(resumed.proposals).toHaveLength(0); expect(advisor.nextInterviewQuestion).not.toHaveBeenCalled();
    expect(advisor.respondToConversation).toHaveBeenLastCalledWith(expect.objectContaining({ facts: expect.arrayContaining([expect.objectContaining({ key: "users-scale" })]) }));
  });
  it("serializes mutations and enforces persistent per-session budgets", async () => {
    const { id, cookie } = await newProject(); await db.getRepository(ProjectEntity).update(id, { lockedAt: new Date() });
    expect((await interview(req(cookie, { action: "next" }), params(id))).status).toBe(409);
    await db.getRepository(ProjectEntity).update(id, { lockedAt: null }); const project = await db.getRepository(ProjectEntity).findOneByOrFail({ id });
    await db.getRepository(GuestEntity).update(project.guestId, { aiRequests: 30 });
    expect((await interview(req(cookie, { action: "next" }), params(id))).status).toBe(429); expect(advisor.nextInterviewQuestion).not.toHaveBeenCalled();
  });
  it("tracks scheduled reviews and explicit checkpoint updates with stable graph IDs", async () => {
    const { id, cookie, project } = await workspace(); const cp = project.checkpoints[0];
    const scheduled = await body(await update(req(cookie, { reviewDate: "2025-01-01" }, "PATCH"), cpParams(id, cp.id)));
    expect(scheduled.checkpoints[0].triggers.some((t) => t.dueAt === "2025-01-01T00:00:00.000Z" && !t.resolvedAt)).toBe(true);
    vi.mocked(advisor.respondToConversation).mockResolvedValue({ answer: "I propose a targeted revision to cover cancellation.", followup: null, materialChange: null, proposals: [{ rationale: "This new criterion covers the changed access boundary.", operation: { type: "update_checkpoint", checkpoint: { ...assessment.checkpoints[0], acceptanceCriteria: [...assessment.checkpoints[0].acceptanceCriteria, "Cancelled accounts cannot read customer records."] } } }] });
    const proposed = await stripeChat(id, cookie);
    const approved = await body(await decide(req(cookie, { decision: "approved" }), propParams(id, proposed.proposals[0].id)));
    expect(approved.checkpoints).toHaveLength(3); expect(approved.risks).toHaveLength(3);
    expect(approved.checkpoints[0]).toMatchObject({ id: cp.id, riskId: cp.riskId, status: "needs_action" });
    expect(approved.checkpoints[0].acceptanceCriteria).toHaveLength(3);
  });
});
