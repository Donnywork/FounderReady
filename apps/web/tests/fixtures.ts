// Deterministic demo data used only by automated tests. Never loaded by the running product.
import type { z } from "zod";
import type { assessmentSchema, questionSchema, profileSchema, evidenceReviewSchema, impactSchema, explorationResponseSchema } from "@/lib/contracts";

export const demoDescription = "I built an AI customer-support chatbot using Lovable, Supabase, and OpenAI and want to invite my first 50 beta users.";
export const question: z.infer<typeof questionSchema> = { text: "What private customer information can the chatbot access?", explanation: "Customer messages may contain personal information. We need to know what could be exposed.", suggestions: ["Public help articles only", "Private customer messages", "Both public and private data"] };
export const profile: z.infer<typeof profileSchema> = {
  title: "Demo support chatbot", summary: "An AI customer-support chatbot built with Lovable, Supabase, and OpenAI, preparing for 50 beta users. Data access, AI permissions, and spending controls are not yet established.",
  facts: [
    { key: "product-stage", label: "Product & stage", value: "AI customer-support chatbot; preparing for first beta", provenance: "founder_reported", confidence: "high" },
    { key: "users-scale", label: "Users & scale", value: "First 50 beta users", provenance: "founder_reported", confidence: "high" },
    { key: "stack-integrations", label: "Stack & integrations", value: "Lovable, Supabase, OpenAI", provenance: "founder_reported", confidence: "high" },
    { key: "data-handled", label: "Data handled", value: "Private customer data access is unknown", provenance: "unknown", confidence: "high" },
    { key: "ai-permissions", label: "AI permissions", value: "Tool permissions and data access are unknown", provenance: "unknown", confidence: "high" },
    { key: "critical-workflows", label: "Critical workflows", value: "Answering support questions", provenance: "ai_inferred", confidence: "medium" },
    { key: "unknowns", label: "Unknowns", value: "Authentication, isolation, cost caps, recovery and deployment", provenance: "unknown", confidence: "high" },
  ],
};
export const assessment: z.infer<typeof assessmentSchema> = {
  checkpoints: [
    { key: "customer-data-isolation", domain: "security", title: "Keep customer data separate", priority: "P0", risk: "If retrieval is not scoped to the signed-in customer, private support messages could be shared with someone else.", reasoning: "Before 50 real users join, cross-customer access could expose private information; the controls are unknown.", action: "Have your builder check data access with two customer accounts.", acceptanceCriteria: ["A customer cannot retrieve another customer's data by changing an identifier.", "Retrieval tests cover two separate customer accounts."], reviewTriggers: ["Authentication, sharing, or customer identity changes."], reviewDate: null, basis: "unknown", uncertainty: "Account isolation and row-level policies have not been demonstrated.", legalFlag: "If support messages contain personal data, review retention and notices with qualified counsel." },
    { key: "ai-spend-limits", domain: "cost", title: "Put limits on AI spending", priority: "P1", risk: "Unrestricted generation could create an unexpected bill if traffic increases or someone automates requests.", reasoning: "Variable model costs create exposure at beta; per-customer usage limits are unknown.", action: "Set per-customer usage limits and test a spending alert.", acceptanceCriteria: ["A customer exceeding their allowance receives a clear limit message.", "A test confirms that a spending alert reaches the owner."], reviewTriggers: ["Model pricing, subscriptions, or expected traffic changes."], reviewDate: null, basis: "unknown", uncertainty: "Provider budgets and enforced application caps are unknown.", legalFlag: null },
    { key: "ai-permission-boundary", domain: "ai", title: "Test the chatbot’s permission boundary", priority: "P0", risk: "Instructions in customer content could make the chatbot expose data or use tools outside its intended permissions.", reasoning: "Customer input reaches the model before beta, while tool access and prompt-injection behavior are untested.", action: "Inventory tool permissions and test malicious customer messages.", acceptanceCriteria: ["Injected instructions cannot retrieve another customer's support history.", "The chatbot cannot execute unauthorized tools or actions."], reviewTriggers: ["Agent tools or model provider changes."], reviewDate: null, basis: "unknown", uncertainty: "Whether the model can call tools is unknown.", legalFlag: null },
  ],
  relations: [{ fromKey: "ai-permission-boundary", toKey: "customer-data-isolation", type: "depends_on" }],
};
export const engineeringPrompt = "Inspect the existing Lovable, Supabase and OpenAI support chatbot. Verify customer data isolation with two test accounts. Do not assume row-level policies work. Add negative identifier and retrieval tests, run them in staging using synthetic data, and return the commands, exact results, environment, relevant code references, and any remaining gaps. Do not expose secrets or touch production customer records.";
export const evidenceReview: z.infer<typeof evidenceReviewSchema> = { summary: "The supplied claim does not show criterion-level test results. Implementation may exist, but these checks remain unproven.", findings: [{ criterionIndex: 0, assessment: "unclear", explanation: "No cross-account request or denial output was supplied." }, { criterionIndex: 1, assessment: "unsupported", explanation: "The evidence does not identify two accounts or show their retrieval results." }], followupChecks: ["Return the two-account negative test command and actual output."] };
export const stripeImpact: z.infer<typeof impactSchema> = {
  summary: "Stripe adds payment events and subscription entitlements. Review those paths and revisit how paid plans interact with AI spending limits.",
  proposals: [
    { rationale: "You reported a new integration; store it in shared project context.", operation: { type: "set_fact", fact: { ...profile.facts[2], value: "Lovable, Supabase, OpenAI, Stripe subscriptions" } } },
    { rationale: "Payment events must change access only after trusted processing.", operation: { type: "create_checkpoint", checkpoint: { ...assessment.checkpoints[0], key: "stripe-webhook-entitlements", domain: "reliability", title: "Verify Stripe subscription events", risk: "Forged or repeated payment events could grant the wrong subscription access or leave a paying customer locked out.", action: "Verify signatures, deduplicate webhooks, and test subscription state transitions.", acceptanceCriteria: ["Forged webhook signatures are rejected and replayed events do not duplicate entitlements.", "Payment failure and cancellation remove access according to the documented policy."], reviewTriggers: ["Stripe events, prices, or subscription entitlement rules change."], legalFlag: null } } },
    { rationale: "Subscriptions change how AI allowances should be enforced.", operation: { type: "reopen_checkpoint", key: "ai-spend-limits", reason: "Test per-plan model allowances after adding Stripe subscriptions." } },
  ],
};

export const explorationResponse: z.infer<typeof explorationResponseSchema> = {
  answer: "Let’s look for what your current assessment might be missing. Your support chatbot depends on OpenAI and Supabase; an upstream outage could leave your first 50 users without support. This is a potential risk to investigate, not a confirmed failure.",
  followup: "What should customers see when your AI provider is unavailable?", materialChange: null,
  coverage: [{ domain: "reliability", outcome: "exploring", summary: "Provider failure behavior and recovery have not yet been established." }],
  proposals: [{ rationale: "Your current map does not cover a provider outage interrupting customer support.", operation: { type: "create_checkpoint", checkpoint: {
    key: "provider-outage-recovery", domain: "reliability", title: "Validate provider outage recovery", priority: "P1", basis: "unknown",
    risk: "An upstream provider outage could leave customers waiting for support without a useful fallback.", reasoning: "Your first beta customers may depend on answers while provider failure behavior remains unknown.",
    action: "Simulate an unavailable AI provider and validate customer messaging and recovery.", acceptanceCriteria: ["Provider timeouts show a useful fallback message without losing the customer question.", "Service recovers without duplicate responses after the provider returns."],
    reviewTriggers: ["Provider dependencies or fallback behavior change."], reviewDate: null, uncertainty: "Timeouts, retries and customer fallback behavior have not been demonstrated.", legalFlag: null,
  } } }],
};
