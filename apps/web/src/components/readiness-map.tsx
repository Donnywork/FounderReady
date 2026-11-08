"use client";
import { useState } from "react";
import { ChevronDown, ArrowRight, TriangleAlert } from "lucide-react";
import { type Domain, type ProjectDetail } from "@/lib/contracts";
import { readinessGraph } from "@/lib/graph";
import { cn } from "@/lib/utils";
import { PriorityBadge } from "./ui/priority-badge";
import { Status } from "./ui/checkpoint-status";
import { Button } from "./ui/button";

export function ReadinessMap({ project, openCheckpoint, explore, busy }: { project: ProjectDetail; openCheckpoint: (id: string) => void; explore: (domain: Domain | null) => void; busy: boolean }) {
  const [expanded, setExpanded] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const risk = project.risks.find((r) => r.id === selected);
  const related = project.relations.filter((r) => r.fromRiskId === selected || r.toRiskId === selected);
  const graph = readinessGraph(project);
  return <section>
    <div className="flex flex-wrap items-start justify-between gap-4"><h1 className="page-title">Readiness map</h1><Button id="explore-blind-spots" variant="outline" disabled={busy} onClick={() => explore(null)}>Explore blind spots</Button></div><p className="page-intro">Open a domain to explore risks and their checkpoints. Priority badges highlight what needs attention; labeled icons show status. Explore blind spots to question the assessment or investigate what’s missing.</p>
    <p className="mt-3 text-support text-muted-foreground">Domain → risk → checkpoint · dependency links appear when you select a risk</p>
    <div className="mt-6 divide-y border-y">{graph.domainNodes.map(({ key, title: label, progress, coverage: area }) => {
      const children = project.checkpoints.filter((c) => c.domain === key); const open = expanded.includes(key);
      const emptyLabel = area.status === "assessed_no_risks" ? "Reviewed · no current risks identified" : area.status === "exploring" ? "Exploration in progress" : "Not assessed yet";
      return <div key={key}>
        <h2><button aria-expanded={open} aria-controls={`domain-${key}`} className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-4 text-left transition-colors hover:bg-muted" onClick={() => setExpanded(open ? expanded.filter((d) => d !== key) : [...expanded, key])}>
          <span className="min-w-0"><span className="section-title">{label}</span><span className="mt-2 block text-support font-normal text-muted-foreground">{children.length ? `${progress.complete} of ${progress.total} founder-confirmed${progress.complete === 0 ? " · awaiting verification" : ""}` : emptyLabel}</span>{children.length > 0 && <span className={cn("mt-2 flex items-center gap-1.5 text-label", progress.critical ? "text-critical" : "text-muted-foreground")}>{progress.critical > 0 && <TriangleAlert aria-hidden="true" className="size-4" />}{progress.critical} open P0{progress.critical > 0 && " · needs attention"}</span>}</span>
          <ChevronDown aria-hidden="true" size={20} className={cn("text-primary transition-transform", open && "rotate-180")} />
        </button></h2>
        {!children.length && <Button variant="link" className="mb-3 ml-2 px-0" disabled={busy} onClick={() => explore(key)} aria-label={`Explore this area: ${label}`}>Explore this area<ArrowRight aria-hidden="true" /></Button>}
        {open && <div id={`domain-${key}`} className="mb-4 ml-2 border-l pl-3 sm:ml-3 sm:pl-4">{children.length ? children.map((c) => <div key={c.id} className="border-b py-4 first:pt-2 last:border-0 last:pb-0">
          <button aria-pressed={selected === c.riskId} className={cn("w-full rounded-md border-l-2 p-3 text-left transition-colors", selected === c.riskId ? "border-primary bg-accent" : "border-transparent hover:bg-muted")} onClick={() => setSelected(c.riskId)}>
            <span className="flex flex-wrap items-center gap-2"><span className="text-label text-muted-foreground">Risk</span><PriorityBadge priority={c.priority} /></span>
            <span className="card-title mt-2 block">{c.title}</span><span className="mt-2 block"><Status checkpoint={c} /></span>
          </button>
          <button className="mt-2 flex w-full items-start gap-3 rounded-md px-3 py-2 text-left text-body text-primary transition-colors hover:bg-accent" onClick={() => openCheckpoint(c.id)}><span className="min-w-0"><span className="font-semibold underline underline-offset-4">Checkpoint:</span> {c.action}</span><ArrowRight aria-hidden="true" size={18} className="mt-1" /></button>
        </div>) : <p className="py-2 text-body text-muted-foreground">{area.summary ?? "Discuss the unknowns and decide what needs checking."}{area.status === "assessed_no_risks" && " This reflects the information reviewed so far."}</p>}</div>}
      </div>;
    })}</div>
    {risk && <aside className="mt-6 border-l-2 border-primary pl-4" aria-label="Selected risk"><h2 className="section-title">{risk.title}</h2><p className="mt-3 text-body">{risk.explanation}</p><p className="mt-3 text-body text-muted-foreground"><span className="font-medium">Uncertainty:</span> {risk.uncertainty}</p>{risk.legalFlag && <p className="mt-3 text-body text-warning">For qualified legal review: {risk.legalFlag}</p>}<div className="mt-4 space-y-3">{related.map((r) => { const other = project.risks.find((n) => n.id === (r.fromRiskId === selected ? r.toRiskId : r.fromRiskId)); return <button key={r.id} className="block min-h-11 text-left text-ui text-primary underline underline-offset-4 hover:text-primary-hover" onClick={() => { if (other) { setSelected(other.id); setExpanded((e) => [...new Set([...e, other.domain])]); } }}>{r.type === "related_to" ? "Related to" : r.fromRiskId === selected ? "Depends on" : "Required by"}: {other?.title}</button>; })}</div></aside>}
  </section>;
}
