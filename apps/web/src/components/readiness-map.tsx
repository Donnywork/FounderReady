"use client";
import { useState } from "react";
import { ChevronDown, ArrowRight, TriangleAlert, GitBranch } from "lucide-react";
import { domains, priorityRank, isConfirmed, type Domain, type ProjectDetail } from "@/lib/contracts";
import { readinessGraph } from "@/lib/graph";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "./ui/priority-badge";
import { Status } from "./ui/checkpoint-status";
import { Button } from "./ui/button";

const INITIAL_VISIBLE_RISKS = 2;

export function ReadinessMap({ project, openCheckpoint, explore, busy }: { project: ProjectDetail; openCheckpoint: (id: string) => void; explore: (domain: Domain | null) => void; busy: boolean }) {
  const [expanded, setExpanded] = useState<string[]>(() => Object.keys(domains));
  const [expandedRiskLists, setExpandedRiskLists] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const graph = readinessGraph(project);
  const allKeys = graph.domainNodes.map((d) => d.key);
  const allExpanded = allKeys.every((k) => expanded.includes(k));
  const allCollapsed = allKeys.every((k) => !expanded.includes(k));
  const assessedCount = graph.domainNodes.filter((d) => d.assessed).length;
  const selectedRelations = selected ? project.relations.filter((r) => r.fromRiskId === selected || r.toRiskId === selected) : [];

  function selectAndJump(riskId: string, domain: Domain) {
    setSelected(riskId);
    setExpanded((e) => [...new Set([...e, domain])]);
    setExpandedRiskLists((e) => [...new Set([...e, domain])]);
    requestAnimationFrame(() => {
      document.getElementById(`risk-node-${riskId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }

  return <section className="@container">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <h1 className="page-title">Readiness map</h1>
      <Button id="explore-blind-spots" variant="outline" disabled={busy} onClick={() => explore(null)}>Explore blind spots</Button>
    </div>
    <p className="page-intro">Open a domain to explore risks and their checkpoints. Priority badges highlight what needs attention; labeled icons show status. Explore blind spots to question the assessment or investigate what’s missing.</p>

    {/* Minimal Toolbar */}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y py-3">
      <p className="text-support text-muted-foreground">
        {assessedCount} of {graph.domainNodes.length} areas assessed · {project.risks.length} {project.risks.length === 1 ? "risk" : "risks"}
        {project.relations.length > 0 && ` · ${project.relations.length} ${project.relations.length === 1 ? "dependency link" : "dependency links"}`}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setExpanded(allExpanded ? [] : allKeys)}
      >
        {allExpanded ? "Collapse all areas" : "Expand all areas"}
      </Button>
    </div>

    {/* Clean 2x2 Domain Grid */}
    <div className={cn(
      "mt-6 grid grid-cols-1 gap-5 @2xl:grid-cols-2",
      allCollapsed ? "auto-rows-fr items-stretch" : "items-start"
    )}>
      {graph.domainNodes.map(({ key, title: label, progress, coverage: area }) => {
        const sortedChildren = project.checkpoints
          .filter((c) => c.domain === key)
          .slice()
          .sort((a, b) => Number(isConfirmed(a)) - Number(isConfirmed(b)) || priorityRank[a.priority] - priorityRank[b.priority] || a.title.localeCompare(b.title));
        const open = expanded.includes(key);
        const emptyLabel = area.status === "assessed_no_risks" ? "Reviewed · no current risks identified" : area.status === "exploring" ? "Exploration in progress" : "Not assessed yet";
        const domainRiskIds = new Set(sortedChildren.map((c) => c.riskId));
        const hasSelectedInDomain = selected ? domainRiskIds.has(selected) : false;

        const showAllRisks = expandedRiskLists.includes(key) || (hasSelectedInDomain && sortedChildren.findIndex((c) => c.riskId === selected) >= INITIAL_VISIBLE_RISKS);
        const visibleChildren = showAllRisks ? sortedChildren : sortedChildren.slice(0, INITIAL_VISIBLE_RISKS);
        const hiddenCount = sortedChildren.length - visibleChildren.length;

        return (
          <div
            key={key}
            className=" rounded-xl border bg-surface px-5 py-4"
          >
            {/* Minimal Domain Header */}
            <h2>
              <button
                aria-expanded={open}
                aria-controls={`domain-${key}`}
                className="flex w-full items-start justify-between gap-3 rounded-md py-1 text-left transition-colors hover:text-primary"
                onClick={() => setExpanded(open ? expanded.filter((d) => d !== key) : [...expanded, key])}
              >
                <span className="min-w-0 flex-1">
                  <span className="section-title block">{label}</span>
                  <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-support font-normal text-muted-foreground">
                    <span>
                      {sortedChildren.length
                        ? `${progress.complete} of ${progress.total} founder-confirmed${progress.complete === 0 ? " · awaiting verification" : ""}`
                        : emptyLabel}
                    </span>
                    {sortedChildren.length > 0 && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className={cn("inline-flex items-center gap-1 font-semibold", progress.critical ? "text-critical" : "text-muted-foreground")}>
                          {progress.critical > 0 && <TriangleAlert aria-hidden="true" className="size-3.5" />}
                          {progress.critical} open P0{progress.critical > 0 && " · needs attention"}
                        </span>
                      </>
                    )}
                  </span>
                </span>
                <ChevronDown aria-hidden="true" size={20} className={cn("mt-1.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
              </button>
            </h2>

            {!sortedChildren.length && !open && (
              <Button variant="link" className="mt-2 px-0" disabled={busy} onClick={() => explore(key)} aria-label={`Explore this area: ${label}`}>
                Explore this area<ArrowRight aria-hidden="true" />
              </Button>
            )}

            {/* Foldable Domain Body */}
            {open && (
              <div id={`domain-${key}`} className="mt-3 border-t pt-3">
                {sortedChildren.length ? (
                  <div>
                    <div className={cn("divide-y", showAllRisks && sortedChildren.length > 3 && "max-h-[34rem] overflow-y-auto pr-1")}>
                      {visibleChildren.map((c) => {
                        const itemRisk = project.risks.find((r) => r.id === c.riskId);
                        const itemRelations = project.relations.filter((r) => r.fromRiskId === c.riskId || r.toRiskId === c.riskId);
                        const dependsOnCount = itemRelations.filter((r) => r.type === "depends_on" && r.fromRiskId === c.riskId).length;
                        const requiredByCount = itemRelations.filter((r) => r.type === "depends_on" && r.toRiskId === c.riskId).length;
                        const relatedToCount = itemRelations.filter((r) => r.type === "related_to").length;
                        const isSelected = selected === c.riskId;
                        const linkedEdge = !isSelected && selected
                          ? selectedRelations.find((r) => r.fromRiskId === c.riskId || r.toRiskId === c.riskId)
                          : undefined;
                        const linkedLabel = linkedEdge
                          ? linkedEdge.type === "related_to"
                            ? "Connected to selected risk"
                            : linkedEdge.fromRiskId === selected
                              ? "Selected risk depends on this"
                              : "Depends on selected risk"
                          : null;

                        return (
                          <div key={c.id} id={`risk-node-${c.riskId}`} className="py-3.5 first:pt-1 last:pb-1">
                            {/* Risk Row */}
                            <button
                              aria-pressed={isSelected}
                              className={cn(
                                "w-full rounded-lg border-l-2 px-3 py-2.5 text-left transition-colors",
                                isSelected
                                  ? "border-primary bg-accent"
                                  : linkedLabel
                                    ? "border-primary bg-muted"
                                    : "border-transparent hover:bg-muted"
                              )}
                              onClick={() => setSelected(isSelected ? null : c.riskId)}
                            >
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="text-label text-muted-foreground">Risk</span>
                                <PriorityBadge priority={c.priority} />
                              </span>
                              <span className="card-title mt-2 block">{c.title}</span>
                              <span className="mt-2 flex flex-wrap items-center justify-between gap-2">
                                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                  <Status checkpoint={c} />
                                  {itemRelations.length > 0 && (
                                    <span className="inline-flex items-center gap-1 text-support font-medium text-primary">
                                      <GitBranch aria-hidden="true" className="size-3.5" />
                                      <span>
                                        {requiredByCount > 0
                                          ? `Required by ${requiredByCount}`
                                          : dependsOnCount > 0
                                            ? `Depends on ${dependsOnCount}`
                                            : `${relatedToCount} linked`}
                                      </span>
                                    </span>
                                  )}
                                  {linkedLabel && (
                                    <span className="text-support font-semibold text-primary">
                                      · {linkedLabel}
                                    </span>
                                  )}
                                </span>
                                <span className="text-support text-muted-foreground underline underline-offset-4">
                                  {isSelected ? "Hide details" : "Why it matters"}
                                </span>
                              </span>
                            </button>

                            {/* Compact Checkpoint Link */}
                            <button
                              className="mt-1.5 flex w-full items-start justify-between gap-3 rounded-lg px-3 py-2 text-left text-support text-primary transition-colors hover:bg-accent"
                              onClick={() => openCheckpoint(c.id)}
                            >
                              <span className="min-w-0">
                                <span className="font-semibold underline underline-offset-4">Checkpoint:</span> {c.action}
                              </span>
                              <ArrowRight aria-hidden="true" size={16} className="mt-0.5 shrink-0" />
                            </button>

                            {/* Inline Selected Risk Details */}
                            {isSelected && itemRisk && (
                              <aside className="mt-2 ml-3 rounded-r-lg border-l-2 border-primary bg-muted px-3.5 py-3" aria-label="Selected risk">
                                <h3 className="text-label text-foreground">{itemRisk.title}</h3>
                                <p className="mt-1.5 text-support text-foreground">{itemRisk.explanation}</p>
                                <p className="mt-2 text-support text-muted-foreground">
                                  <span className="font-semibold text-foreground">Uncertainty:</span> {itemRisk.uncertainty}
                                </p>
                                {itemRisk.legalFlag && (
                                  <p className="mt-2 text-support text-warning">
                                    <span className="font-semibold">For qualified legal review:</span> {itemRisk.legalFlag}
                                  </p>
                                )}
                                {itemRelations.length > 0 && (
                                  <div className="mt-3 space-y-1.5 border-t border-border pt-2.5">
                                    {itemRelations.map((r) => {
                                      const other = project.risks.find(
                                        (n) => n.id === (r.fromRiskId === itemRisk.id ? r.toRiskId : r.fromRiskId)
                                      );
                                      const relationLabel =
                                        r.type === "related_to"
                                          ? "Related to"
                                          : r.fromRiskId === itemRisk.id
                                            ? "Depends on"
                                            : "Required by";
                                      return (
                                        <button
                                          key={r.id}
                                          className="block min-h-9 text-left text-support font-medium text-primary underline underline-offset-4 hover:text-primary-hover"
                                          onClick={() => {
                                            if (other) selectAndJump(other.id, other.domain);
                                          }}
                                        >
                                          {relationLabel}: {other?.title}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </aside>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Multi-risk overflow toggle when a card has >2 risks */}
                    {sortedChildren.length > INITIAL_VISIBLE_RISKS && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRiskLists((list) =>
                            list.includes(key) ? list.filter((k) => k !== key) : [...list, key]
                          )
                        }
                        className="mt-2 flex min-h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-support font-medium text-primary transition-colors hover:bg-accent"
                      >
                        <span>
                          {showAllRisks
                            ? `Show fewer (${INITIAL_VISIBLE_RISKS} of ${sortedChildren.length})`
                            : `Show ${hiddenCount} more ${hiddenCount === 1 ? "risk" : "risks"} (${sortedChildren.length} total)`}
                        </span>
                        <ChevronDown aria-hidden="true" size={15} className={cn("transition-transform", showAllRisks && "rotate-180")} />
                      </button>
                    )}

                    <div className="mt-2 border-t pt-2">
                      <Button variant="link" className="h-auto px-0 py-1 text-support" disabled={busy} onClick={() => explore(key)}>
                        Explore more in this area<ArrowRight aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="py-1">
                    <p className="text-support text-muted-foreground">
                      {area.summary ?? "Discuss the unknowns and decide what needs checking."}
                      {area.status === "assessed_no_risks" && " This reflects the information reviewed so far."}
                    </p>
                    <Button variant="link" className="mt-1 h-auto px-0 py-1 text-support" disabled={busy} onClick={() => explore(key)} aria-label={`Explore this area: ${label}`}>
                      Explore this area<ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  </section>;
}
