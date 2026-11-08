"use client";
import { useState } from "react";
import { domains, dispositionLabels, statusLabels, type ChangeProposal } from "@/lib/contracts";
import type { Mutate } from "./checkpoint-panel";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const fieldLabels: Record<string, string> = { label: "Fact", value: "Value", provenance: "Source", confidence: "Confidence in source", domain: "Domain", title: "Title", risk: "Why it matters", priority: "Priority", reasoning: "Priority reason", action: "Action", acceptanceCriteria: "Acceptance criteria", reviewTriggers: "Review again when", reviewDate: "Review date", basis: "Basis", uncertainty: "Still unknown", legalFlag: "For qualified legal review", status: "Work status", disposition: "Founder disposition", owner: "Owner", completedAt: "Last confirmation", reason: "Reason", fromKey: "From risk", toKey: "To risk", type: "Relationship" };
const values: Record<string, string> = { ...domains, ...statusLabels, ...dispositionLabels, founder_reported: "Founder-reported", ai_inferred: "AI-inferred", depends_on: "Depends on", related_to: "Related to" };
function display(value: unknown): string {
  if (value === null || value === undefined) return "Not recorded";
  if (typeof value === "string") return values[value] ?? value;
  if (Array.isArray(value)) return value.map(display).join("\n");
  if (typeof value === "object") return Object.entries(value).filter(([key]) => key !== "key").map(([key, v]) => `${fieldLabels[key] ?? key}: ${display(v)}`).join("\n");
  return String(value);
}
export function Proposal({ proposal: p, busy, mutate, discovery = false, discuss }: { proposal: ChangeProposal; busy: boolean; mutate: Mutate; discovery?: boolean; discuss?: (prompt: string) => void }) {
  const [reason, setReason] = useState("");
  const op = p.operation;
  const title = op.type === "set_fact" ? `Update ${op.fact.label}` : op.type === "reopen_checkpoint" ? `Reopen ${op.key.replaceAll("-", " ")}` : op.type === "relate_risks" ? "Connect related risks" : `${op.type === "create_checkpoint" ? "Add" : "Update & reopen"} ${op.checkpoint.title}`;
  const after = op.type === "set_fact" ? op.fact : op.type === "reopen_checkpoint" ? { status: "needs_action", reason: op.reason } : op.type === "relate_risks" ? op.relation : op.checkpoint;
  const editable = p.state === "pending" || p.state === "deferred";
  const risk = discovery && (op.type === "create_checkpoint" || op.type === "update_checkpoint") ? op.checkpoint : null;
  return <article className="border-y py-4" aria-label={title}>{risk && <p className="mb-2 text-label text-primary">{op.type === "update_checkpoint" ? "Update an existing risk" : risk.basis === "unknown" ? "Potential new risk" : "New risk · based on reported information"}</p>}<div className="flex flex-wrap items-center justify-between gap-2"><h3 className="card-title">{title}</h3><span className="text-label text-muted-foreground">{p.state === "pending" ? "Awaiting your review" : p.state}</span></div><p className="mt-3 text-body text-muted-foreground">{p.rationale}</p>
    {risk && <div className="mt-4 space-y-3 text-body"><p className="text-label text-muted-foreground">{domains[risk.domain]}</p><p><strong>Why it matters:</strong> {risk.risk}</p><p><strong>Suggested checkpoint:</strong> {risk.action}</p><p className="text-support text-muted-foreground">Still to investigate: {risk.uncertainty}</p></div>}
    <details className="mt-4"><summary className="min-h-8 text-ui text-primary underline underline-offset-4">Review proposed changes</summary><div className={`mt-4 grid gap-4 ${discovery ? "" : "sm:grid-cols-2"}`}><div className="min-w-0"><h4 className="text-label">Current</h4><pre className="mt-2 whitespace-pre-wrap rounded bg-muted p-4 font-sans text-support">{display(p.before)}</pre></div><div className="min-w-0"><h4 className="text-label">Proposed</h4><pre className="mt-2 whitespace-pre-wrap rounded bg-accent p-4 font-sans text-support">{display(after)}</pre></div></div></details>
    {editable && <div className="mt-4"><Input aria-label={`Decision note for ${title}`} placeholder="Decision note (optional)" maxLength={1200} value={reason} onChange={(e) => setReason(e.target.value)} disabled={busy} /><div className="mt-3 flex flex-wrap gap-2">{risk ? <>
      <Button size="sm" disabled={busy} onClick={() => void mutate(`/proposals/${p.id}`, { decision: "approved", reason })}>{op.type === "create_checkpoint" ? "Add to Readiness Map" : "Update Readiness Map"}</Button>
      {discuss && <Button size="sm" variant="outline" disabled={busy} onClick={() => discuss(`Before deciding on “${risk.title}”, I’d like to discuss `)}>Keep discussing</Button>}
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void mutate(`/proposals/${p.id}`, { decision: "rejected", reason })}>Dismiss</Button>
    </> : (["approved", "rejected", "deferred"] as const).map((decision) => <Button key={decision} size="sm" variant={decision === "approved" ? "default" : "outline"} disabled={busy} onClick={() => void mutate(`/proposals/${p.id}`, { decision, reason })}>{decision === "approved" ? "Approve" : decision === "rejected" ? "Reject" : "Review later"}</Button>)}</div>{risk && <p className="mt-3 text-support text-muted-foreground">Approval adds work to track. It does not verify the checkpoint.</p>}</div>}
    {p.decisionReason && <p className="mt-3 text-support text-muted-foreground">Decision note: {p.decisionReason}</p>}
  </article>;
}
