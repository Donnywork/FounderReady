import { domains, readiness, type ProjectDetail } from "./contracts";
import { readinessCoverage } from "./coverage";

// Hierarchy is derived from persisted ownership, so there is no second editable map state.
export function readinessGraph(project: Pick<ProjectDetail, "risks" | "checkpoints" | "relations" | "events" | "proposals">) {
  const coverage = readinessCoverage(project);
  const domainNodes = Object.entries(domains).map(([key, title]) => {
    const children = project.checkpoints.filter((c) => c.domain === key);
    const area = coverage.find((c) => c.domain === key)!;
    return { id: `domain-${key}`, key: area.domain, kind: "domain" as const, title, assessed: children.length > 0 || area.status === "assessed_no_risks", coverage: area, progress: readiness(children) };
  });
  const riskNodes = project.risks.map((r) => ({ id: `risk-${r.id}`, resourceId: r.id, kind: "risk" as const, title: r.title, domain: r.domain }));
  const checkpointNodes = project.checkpoints.map((c) => ({ id: `checkpoint-${c.id}`, resourceId: c.id, kind: "checkpoint" as const, title: c.title, status: c.status, disposition: c.disposition, priority: c.priority }));
  const edges = [
    ...project.risks.map((r) => ({ id: `contains-domain-${r.id}`, from: `domain-${r.domain}`, to: `risk-${r.id}`, type: "contains" as const })),
    ...project.checkpoints.map((c) => ({ id: `contains-risk-${c.id}`, from: `risk-${c.riskId}`, to: `checkpoint-${c.id}`, type: "contains" as const })),
    ...project.relations.map((r) => ({ id: r.id, from: `risk-${r.fromRiskId}`, to: `risk-${r.toRiskId}`, type: r.type })),
  ];
  return { domainNodes, riskNodes, checkpointNodes, edges };
}
