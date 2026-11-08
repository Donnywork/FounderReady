import { coverageReviewSchema, domains, type Domain, type ProjectDetail } from "./contracts";

// Coverage describes the scope of a review, never verification or safety.
// Reuse the immutable event history; profile/readiness changes invalidate old reviews.
export function readinessCoverage(project: Pick<ProjectDetail, "checkpoints" | "events" | "proposals">) {
  const changedAt = project.events.reduce((latest, event) =>
    ["profile_edited", "profile_approved", "proposal_approved"].includes(event.type) ? Math.max(latest, Date.parse(event.createdAt)) : latest, 0);
  return (Object.keys(domains) as Domain[]).map((domain) => {
    const event = project.events.filter((e) => e.type === "area_explored" && e.detail.domain === domain && Date.parse(e.createdAt) >= changedAt).at(-1);
    const review = coverageReviewSchema.safeParse(event?.detail);
    const pending = project.proposals.some((p) => (p.state === "pending" || p.state === "deferred") && (p.operation.type === "create_checkpoint" || p.operation.type === "update_checkpoint") && p.operation.checkpoint.domain === domain);
    const hasRisks = project.checkpoints.some((c) => c.domain === domain);
    const status = hasRisks ? "risks_identified" : pending ? "exploring" : review.success ? review.data.outcome : "not_assessed";
    return { domain, title: domains[domain], status, summary: review.success ? review.data.summary : null,
      conversationId: typeof event?.detail.conversationId === "string" ? event.detail.conversationId : null };
  });
}
