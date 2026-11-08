import type { ProjectDetail } from "../../src/lib/contracts";
import { assessment, demoDescription, profile, stripeImpact } from "../fixtures";

// Long, deterministic content exercises wrapping without using a live project or advisor.
export const longAction = "Have your builder check data access with two customer accounts, including shared documents, archived conversations, and a deliberately changed customer identifier. Record the exact requests and results so you can confirm that private information remains isolated before inviting your first beta users.";
export const longReference = `https://example.com/reviews/${"customer-isolation-".repeat(12)}`;
const createdAt = "2026-11-07T12:00:00.000Z";
const drafts = [...assessment.checkpoints, { ...assessment.checkpoints[1], key: "review-usage", domain: "reliability" as const, title: "Review usage as your customer base grows", priority: "P2" as const }];

export const readabilityProject: ProjectDetail = {
  id: "readability-project", title: "Customer support assistant for independent businesses", description: demoDescription,
  phase: "workspace", updatedAt: createdAt, summary: profile.summary, pendingQuestion: null, answeredCount: 5,
  facts: profile.facts.map((fact, i) => ({ ...fact, id: `fact-${i}`, confirmedAt: null })),
  checkpoints: drafts.map((draft, i) => ({
    ...draft, id: `checkpoint-${i}`, projectId: "readability-project", riskId: `risk-${i}`,
    action: i === 0 ? longAction : draft.action,
    status: i === 0 ? "needs_action" : i === 1 ? "planned" : i === 2 ? "unknown" : "founder_confirmed",
    disposition: "active", owner: "", dispositionReason: "", engineeringPrompt: `Verify these checks and record the results.\n${longReference}`,
    completedAt: i === 3 ? createdAt : null, evidence: [], reviews: [], events: [],
    triggers: draft.reviewTriggers.map((description, j) => ({ id: `trigger-${i}-${j}`, checkpointId: `checkpoint-${i}`, description, dueAt: null, resolvedAt: null })),
  })),
  risks: drafts.map((draft, i) => ({ id: `risk-${i}`, key: draft.key, domain: draft.domain, title: draft.title, explanation: draft.risk, uncertainty: draft.uncertainty, legalFlag: draft.legalFlag })),
  relations: [{ id: "relation-0", fromRiskId: "risk-2", toRiskId: "risk-0", type: "depends_on" }],
  conversations: [
    { id: "empty", kind: "chat", title: "Planning a safe beta for our first customers", checkpointId: null, createdAt, messages: [] },
    { id: "history", kind: "chat", title: "Understanding customer data isolation before inviting the first fifty beta users", checkpointId: "checkpoint-0", createdAt, messages: [
      { id: "message-0", conversationId: "history", role: "user", content: "What should I check before inviting customers?", createdAt },
      { id: "message-1", conversationId: "history", role: "assistant", content: `Start with customer data isolation. Ask your builder to verify that one customer cannot access another customer’s private messages.\n\n${longAction}\n\nKeep the test results with your checkpoint: ${longReference}`, createdAt },
    ] },
  ],
  proposals: stripeImpact.proposals.map((proposal, i) => ({ ...proposal, id: `proposal-${i}`, conversationId: "history", messageId: "message-1", before: null, state: "pending", decisionReason: "", createdAt, decidedAt: null })),
  events: [],
};
