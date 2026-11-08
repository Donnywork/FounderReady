import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { answerSchema, assessmentSchema, evidenceInputSchema, readiness, updateCheckpointSchema } from "@/lib/contracts";
import { checkOrigin, readBody } from "@/server/http";
import { assessment } from "./fixtures";
import { interviewFocus } from "@/server/ai/interview-focus";

describe("verification rules", () => {
  it("requires explicit confirmation and recorded disposition reasons", () => {
    expect(updateCheckpointSchema.safeParse({ status: "founder_confirmed" }).success).toBe(false);
    expect(updateCheckpointSchema.safeParse({ status: "founder_confirmed", confirmCompletion: true }).success).toBe(true);
    for (const disposition of ["deferred", "risk_accepted", "not_applicable"]) expect(updateCheckpointSchema.safeParse({ disposition }).success).toBe(false);
    expect(updateCheckpointSchema.safeParse({ status: "planned" }).success).toBe(false);
  });
  it("accepts uncertainty but rejects an empty claimed answer", () => {
    const questionId = randomUUID();
    expect(answerSchema.safeParse({ questionId, disposition: "answered", answer: " " }).success).toBe(false);
    expect(answerSchema.safeParse({ questionId, disposition: "unknown" }).success).toBe(true);
    expect(answerSchema.safeParse({ questionId, disposition: "skipped" }).success).toBe(true);
  });
  it("moves beyond unknown AI topics to permissions and costs without covering every category", () => {
    const context = { description: "An AI chatbot with OpenAI", interview: [{ topic: "users-data", question: "What data?", answer: "I don't know", disposition: "unknown" }] };
    expect(interviewFocus(context).focusTopic).toBe("ai-permissions");
    context.interview.push({ topic: "ai-permissions", question: "Which tools?", answer: "Skipped", disposition: "skipped" });
    expect(interviewFocus(context).focusTopic).toBe("api-costs");
    context.interview.push({ topic: "api-costs", question: "What limits?", answer: "I don't know", disposition: "unknown" });
    expect(interviewFocus(context).focusTopic).toBeNull();
    expect(interviewFocus({ description: "A local booking website", interview: context.interview }).focusTopic).toBe("failure-impact");
  });
  it("rejects assessments outside the 3–5 checkpoint limit", () => {
    expect(assessmentSchema.safeParse(assessment).success).toBe(true);
    expect(assessmentSchema.safeParse({ ...assessment, checkpoints: assessment.checkpoints.slice(0, 2) }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...assessment, checkpoints: [...assessment.checkpoints, ...assessment.checkpoints] }).success).toBe(false);
  });
  it("keeps priority, work status and accepted risk separate from verification", () => {
    expect(readiness([
      { status: "founder_confirmed", priority: "P2", disposition: "active" },
      { status: "founder_confirmed", priority: "P0", disposition: "risk_accepted" },
      { status: "evidence_reviewed", priority: "P0", disposition: "active" },
      { status: "unknown", priority: "P1", disposition: "deferred" },
    ])).toEqual({ total: 4, complete: 1, critical: 1, unknown: 1, pending: 3, accepted: 1 });
    expect(readiness([]).complete).toBe(0);
  });
});
describe("request boundaries", () => {
  it("rejects cross-origin mutations", () => {
    expect(() => checkOrigin(new Request("http://localhost:3000/api/projects", { method: "POST", headers: { origin: "https://unrelated.example", "content-type": "application/json" } }))).toThrow("must come from");
  });
  it("enforces the body size even without Content-Length", async () => {
    const request = new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ content: "x".repeat(50_000), source: "Test output" }) });
    await expect(readBody(request, evidenceInputSchema)).rejects.toMatchObject({ status: 413 });
  });
});
