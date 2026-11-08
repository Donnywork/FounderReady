import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRootEnv } from "../env.cjs";
import type { DataSource } from "typeorm";
import type { ProjectDetail } from "@/lib/contracts";
import { makeDataSource } from "@/server/db/data-source";
import { advisor } from "@/server/ai/advisor";
import { AppError } from "@/server/http";
import { GuestEntity, ProjectEntity } from "@/server/db/entities";
import { GET as list, POST as create } from "@/app/api/projects/route";
import { GET as detail } from "@/app/api/projects/[id]/route";
import { POST as interview } from "@/app/api/projects/[id]/interview/route";
import { POST as followup } from "@/app/api/projects/[id]/followup/route";
import { PATCH as update } from "@/app/api/projects/[id]/checkpoints/[checkpointId]/route";
import { POST as evidence } from "@/app/api/projects/[id]/checkpoints/[checkpointId]/evidence/route";
import { assessment, question } from "./fixtures";

loadRootEnv();
const url = process.env.TEST_DATABASE_URL;
let db: DataSource;
const globalDb = globalThis as unknown as { founderReadyDb?: Promise<DataSource> };
function req(path: string, cookie = "", body?: unknown, method = "POST") {
  return new Request(`http://localhost:3000/api/projects${path}`, { method: body === undefined ? "GET" : method, headers: { cookie, origin: "http://localhost:3000", "content-type": "application/json" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });
const cpParams = (id: string, checkpointId: string) => ({ params: Promise.resolve({ id, checkpointId }) });
async function newProject() {
  const response = await create(req("", "", { description: "I am building a document assistant for small business customers." }));
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const { project } = await response.json();
  return { id: project.id as string, cookie };
}
async function workspace() {
  const session = await newProject();
  const response = await interview(req(`/${session.id}/interview`, session.cookie, { action: "finish" }), params(session.id));
  expect(response.status).toBe(200);
  return { ...session, project: await response.json() as ProjectDetail };
}

describe.skipIf(!url)("API routes with real PostgreSQL and a deterministic advisor", () => {
  beforeAll(async () => {
    if (!new URL(url!).pathname.endsWith("_test")) throw new Error("TEST_DATABASE_URL must name a disposable database ending in _test.");
    db = await makeDataSource(url).initialize();
    await db.runMigrations();
    globalDb.founderReadyDb = Promise.resolve(db);
  });
  beforeEach(async () => {
    vi.restoreAllMocks();
    await db.query("TRUNCATE guests CASCADE");
    vi.spyOn(advisor, "question").mockResolvedValue({ question });
    vi.spyOn(advisor, "assess").mockResolvedValue(assessment);
    vi.spyOn(advisor, "followupQuestion").mockResolvedValue({ question });
  });
  afterAll(async () => { vi.restoreAllMocks(); globalDb.founderReadyDb = undefined; if (db?.isInitialized) await db.destroy(); });

  it("persists guests with opaque cookies and isolates projects and nested resources", async () => {
    const first = await workspace();
    const second = await newProject();
    expect((await detail(req(`/${first.id}`, second.cookie), params(first.id))).status).toBe(404);
    expect((await detail(req(`/${first.id}`), params(first.id))).status).toBe(401);
    const forbidden = await evidence(req("/evidence", second.cookie, { content: "An attempted cross-session write", kind: "reported" }), cpParams(first.id, first.project.checkpoints[0].id));
    expect(forbidden.status).toBe(404);
    const ownList = await (await list(req("", first.cookie))).json();
    expect(ownList.projects.map((p: { id: string }) => p.id)).toEqual([first.id]);
    expect(JSON.stringify(ownList)).not.toContain("guestId");
  });
  it("caps interviews at five and rejects repeated answers without duplicating checkpoints", async () => {
    const { id, cookie } = await newProject();
    let project = await (await interview(req("", cookie, { action: "next" }), params(id))).json() as ProjectDetail;
    const firstQuestion = project.pendingQuestion!.id;
    for (let i = 0; i < 5; i++) {
      const response = await interview(req("", cookie, { action: "answer", response: { questionId: project.pendingQuestion!.id, disposition: i === 1 ? "skipped" : "unknown", answer: "" } }), params(id));
      expect(response.status).toBe(200);
      project = await response.json();
      if (i === 0) expect((await interview(req("", cookie, { action: "answer", response: { questionId: firstQuestion, disposition: "unknown" } }), params(id))).status).toBe(409);
    }
    expect(project.phase).toBe("workspace");
    expect(project.answeredCount).toBe(5);
    expect(project.checkpoints).toHaveLength(3);
    expect(advisor.question).toHaveBeenCalledTimes(5);
    const repeat = await (await interview(req("", cookie, { action: "finish" }), params(id))).json();
    expect(repeat.checkpoints).toHaveLength(3);
    expect(advisor.assess).toHaveBeenCalledTimes(1);
  });
  it("retains answers when the provider fails and resumes without asking again", async () => {
    const { id, cookie } = await newProject();
    const first = await (await interview(req("", cookie, { action: "next" }), params(id))).json() as ProjectDetail;
    vi.mocked(advisor.question).mockRejectedValueOnce(new AppError(502, "Provider unavailable"));
    const failed = await interview(req("", cookie, { action: "answer", response: { questionId: first.pendingQuestion!.id, disposition: "answered", answer: "Private customer documents" } }), params(id));
    expect(failed.status).toBe(502);
    const saved = await (await detail(req("", cookie), params(id))).json() as ProjectDetail;
    expect(saved.answeredCount).toBe(1);
    expect(saved.pendingQuestion).toBeNull();
    expect((await interview(req("", cookie, { action: "next" }), params(id))).status).toBe(200);
  });
  it("requires evidence and confirmation, preserves provenance, and reopens on follow-up", async () => {
    const { id, cookie, project } = await workspace();
    const checkpointId = project.checkpoints[0].id;
    const complete = () => update(req("", cookie, { owner: "Sam", status: "complete", confirmCompletion: true }, "PATCH"), cpParams(id, checkpointId));
    expect((await complete()).status).toBe(400);
    expect((await evidence(req("", cookie, { content: "Two-account retrieval test passed. See test run 42.", kind: "reviewed", reviewer: "Sam" }), cpParams(id, checkpointId))).status).toBe(200);
    expect((await update(req("", cookie, { status: "complete" }, "PATCH"), cpParams(id, checkpointId))).status).toBe(400);
    const done = await (await complete()).json() as ProjectDetail;
    expect(done.checkpoints[0].status).toBe("complete");
    expect(done.checkpoints[0].evidence[0].reviewer).toBe("Sam");
    const started = await (await followup(req("", cookie, { action: "start", changes: "We are adding shared folders across customers." }), params(id))).json() as ProjectDetail;
    vi.spyOn(advisor, "followupAssess").mockResolvedValue({ summary: "Sharing changes the access boundary. Recheck the isolation tests before inviting customers.", affectedCheckpointIds: [checkpointId], nextSteps: ["Test shared folder access with two customer accounts."] });
    const reviewed = await (await followup(req("", cookie, { action: "answer", response: { questionId: started.followup!.question!.id, disposition: "unknown" } }), params(id))).json() as ProjectDetail;
    expect(reviewed.checkpoints[0].status).toBe("needs_review");
    expect(reviewed.checkpoints[0].completedAt).toBeNull();
    expect(reviewed.checkpoints[0].evidence).toHaveLength(1);
    expect(reviewed.conversations).toHaveLength(2);
  });
  it("serializes AI operations and enforces the persistent per-session budget", async () => {
    const { id, cookie } = await newProject();
    await db.getRepository(ProjectEntity).update(id, { lockedAt: new Date() });
    expect((await interview(req("", cookie, { action: "next" }), params(id))).status).toBe(409);
    await db.getRepository(ProjectEntity).update(id, { lockedAt: null });
    const project = await db.getRepository(ProjectEntity).findOneByOrFail({ id });
    await db.getRepository(GuestEntity).update(project.guestId, { aiRequests: 30 });
    expect((await interview(req("", cookie, { action: "next" }), params(id))).status).toBe(429);
    expect(advisor.question).not.toHaveBeenCalled();
  });

  it("rejects invented checkpoint references and retries the saved follow-up answer", async () => {
    const { id, cookie, project } = await workspace();
    const started = await (await followup(req("", cookie, { action: "start", changes: "We are introducing customer document sharing." }), params(id))).json() as ProjectDetail;
    const result = { summary: "The sharing change needs a fresh review of the customer access boundary.", affectedCheckpointIds: ["an-invented-checkpoint"], nextSteps: ["Review document access with two customer accounts."] };
    vi.spyOn(advisor, "followupAssess").mockResolvedValueOnce(result).mockResolvedValueOnce({ ...result, affectedCheckpointIds: [project.checkpoints[0].id] });
    expect((await followup(req("", cookie, { action: "answer", response: { questionId: started.followup!.question!.id, disposition: "unknown" } }), params(id))).status).toBe(502);
    const retry = await followup(req("", cookie, { action: "retry" }), params(id));
    expect(retry.status).toBe(200);
    const saved = await retry.json() as ProjectDetail;
    expect(saved.followup!.answer?.disposition).toBe("unknown");
    expect(saved.followup!.result?.affectedCheckpointIds).toEqual([project.checkpoints[0].id]);
  });
});
