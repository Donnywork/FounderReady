import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { answerSchema, assessmentSchema, evidenceInputSchema, readiness, updateCheckpointSchema } from "@/lib/contracts";
import { checkOrigin, readBody } from "@/server/http";
import { assessment } from "./fixtures";

describe("readiness rules", () => {
  it("requires explicit confirmation for completion and a name for reviewed evidence", () => {
    expect(updateCheckpointSchema.safeParse({ status: "complete" }).success).toBe(false);
    expect(updateCheckpointSchema.safeParse({ status: "complete", confirmCompletion: true }).success).toBe(true);
    expect(evidenceInputSchema.safeParse({ content: "A passing test result", kind: "reviewed" }).success).toBe(false);
  });
  it("accepts uncertainty but rejects an empty claimed answer", () => {
    const questionId = randomUUID();
    expect(answerSchema.safeParse({ questionId, disposition: "answered", answer: " " }).success).toBe(false);
    expect(answerSchema.safeParse({ questionId, disposition: "unknown" }).success).toBe(true);
    expect(answerSchema.safeParse({ questionId, disposition: "skipped" }).success).toBe(true);
  });
  it("rejects assessments outside the 3–5 checkpoint limit", () => {
    expect(assessmentSchema.safeParse(assessment).success).toBe(true);
    expect(assessmentSchema.safeParse({ ...assessment, checkpoints: assessment.checkpoints.slice(0, 2) }).success).toBe(false);
    expect(assessmentSchema.safeParse({ ...assessment, checkpoints: [...assessment.checkpoints, ...assessment.checkpoints] }).success).toBe(false);
  });
  it("counts only manual completions and keeps review items outstanding", () => {
    expect(readiness([{ status: "complete", priority: "high" }, { status: "needs_review", priority: "high" }, { status: "in_progress", priority: "medium" }])).toEqual({ total: 3, complete: 1, urgent: 1, needsReview: 1 });
  });
});
describe("request boundaries", () => {
  it("rejects cross-origin mutations", () => {
    expect(() => checkOrigin(new Request("http://localhost:3000/api/projects", { method: "POST", headers: { origin: "https://unrelated.example", "content-type": "application/json" } }))).toThrow("must come from");
  });
  it("enforces the body size even without Content-Length", async () => {
    const request = new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ content: "x".repeat(25_000), kind: "reported" }) });
    await expect(readBody(request, evidenceInputSchema)).rejects.toMatchObject({ status: 413 });
  });
});
