"use client";
import { useState } from "react";
import { Check, Copy, Plus, ArrowUpRight, CircleCheck } from "lucide-react";
import type { Checkpoint, CheckpointStatus } from "@/lib/contracts";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";

export const statusLabels: Record<CheckpointStatus, string> = { open: "To do", in_progress: "In progress", needs_review: "Needs review", complete: "Complete" };
export type Mutate = (path: string, body: unknown, method?: string) => Promise<boolean>;

export function CheckpointPanel({ checkpoint, busy, mutate }: { checkpoint: Checkpoint; busy: boolean; mutate: Mutate }) {
  const [owner, setOwner] = useState(checkpoint.owner);
  const [status, setStatus] = useState(checkpoint.status);
  const [confirmed, setConfirmed] = useState(false);
  const [content, setContent] = useState("");
  const [kind, setKind] = useState<"reported" | "reviewed">("reported");
  const [reviewer, setReviewer] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  const path = `/checkpoints/${checkpoint.id}`;
  async function copy() {
    try { await navigator.clipboard.writeText(checkpoint.engineeringPrompt); setCopied(true); setCopyError(false); }
    catch { setCopyError(true); }
  }
  return <div className="space-y-8 px-1 pt-2 pb-8 sm:pl-10">
    <div><p className="text-xs text-muted-foreground">{checkpoint.basis === "reported" ? "Based on what you reported" : "An implementation detail to verify"}</p><p className="mt-3 text-sm leading-7">{checkpoint.risk}</p><p className="mt-3 text-sm leading-6 text-muted-foreground"><span className="font-medium text-foreground">Why this priority:</span> {checkpoint.reasoning}</p></div>
    <section><h4 className="text-sm font-semibold">What to do</h4><p className="mt-3 whitespace-pre-wrap text-sm leading-7">{checkpoint.action}</p></section>
    <section><h4 className="text-sm font-semibold">What done looks like</h4><ul className="mt-3 space-y-3">{checkpoint.acceptanceCriteria.map((criterion, index) => <li key={index} className="flex gap-3 text-sm leading-6"><span aria-hidden className="mt-1 size-3.5 shrink-0 rounded-sm border border-input" /><span>{criterion}</span></li>)}</ul></section>
    <section className="rounded-xl border bg-white p-4 sm:p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-sm font-semibold"><ArrowUpRight size={16} className="text-primary" />Hand this to your builder</h4><Button size="sm" variant="outline" onClick={() => void copy()}>{copied ? <Check /> : <Copy />}{copied ? "Copied" : "Copy prompt"}</Button></div><p className="mt-2 text-xs leading-5 text-muted-foreground">A starting point for your engineer or coding agent.</p><details className="mt-4"><summary className="text-xs font-medium text-primary">Read engineering prompt</summary><pre className="mt-4 max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-7" tabIndex={0}>{checkpoint.engineeringPrompt}</pre></details>{copyError && <p role="alert" className="mt-3 text-xs text-amber-800">Clipboard access is unavailable. Open the prompt above to select and copy it.</p>}<span role="status" className="sr-only">{copied ? "Engineering prompt copied to clipboard" : ""}</span></section>
    <section><h4 className="text-sm font-semibold">Supporting evidence</h4><p className="mt-2 text-xs leading-5 text-muted-foreground">Keep a test result, review note, or reference. FounderReady does not inspect links or independently verify evidence.</p>
      {checkpoint.evidence.length > 0 && <ul className="mt-4 divide-y border-y">{checkpoint.evidence.map((e) => <li key={e.id} className="py-4"><div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"><span className="font-medium">{e.kind === "reviewed" ? `Review reported by ${e.reviewer}` : "Reported implementation"}</span><time className="text-muted-foreground" dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleDateString()}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{e.content}</p></li>)}</ul>}
      <form className="mt-4 space-y-3" onSubmit={async (event) => { event.preventDefault(); if (await mutate(`${path}/evidence`, { content, kind, reviewer })) { setContent(""); setReviewer(""); } }}>
        <label htmlFor={`evidence-${checkpoint.id}`} className="text-xs font-medium">Add an evidence note</label><Textarea id={`evidence-${checkpoint.id}`} value={content} onChange={(e) => setContent(e.target.value)} placeholder="What was changed or tested? Include the result and a reference your reviewer can check." minLength={10} maxLength={6000} required disabled={busy} className="mt-2 min-h-24 bg-white" />
        <div className="flex flex-wrap gap-3"><label className="flex flex-1 flex-col gap-1.5 text-xs text-muted-foreground" htmlFor={`kind-${checkpoint.id}`}>Evidence type<select id={`kind-${checkpoint.id}`} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} disabled={busy} className="h-10 rounded-lg border bg-background px-3 text-sm text-foreground"><option value="reported">Reported implementation</option><option value="reviewed">Reviewed by a person</option></select></label>{kind === "reviewed" && <label className="flex flex-1 flex-col gap-1.5 text-xs text-muted-foreground" htmlFor={`reviewer-${checkpoint.id}`}>Reviewer’s name<Input id={`reviewer-${checkpoint.id}`} value={reviewer} onChange={(e) => setReviewer(e.target.value)} required minLength={2} maxLength={120} disabled={busy} /></label>}</div>
        <Button type="submit" variant="outline" size="sm" disabled={busy || content.trim().length < 10 || (kind === "reviewed" && reviewer.trim().length < 2)}><Plus />Add evidence</Button>
      </form>
    </section>
    <section className="border-t pt-6"><h4 className="text-sm font-semibold">Ownership & progress</h4><form className="mt-4 space-y-4" onSubmit={(event) => { event.preventDefault(); void mutate(path, { owner, status, confirmCompletion: confirmed }, "PATCH"); }}>
      <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-xs text-muted-foreground" htmlFor={`owner-${checkpoint.id}`}><span className="block">Who owns this?</span><Input id={`owner-${checkpoint.id}`} value={owner} onChange={(e) => setOwner(e.target.value)} maxLength={120} placeholder="Unassigned" disabled={busy} /></label><label className="space-y-2 text-xs text-muted-foreground" htmlFor={`status-${checkpoint.id}`}><span className="block">Status</span><select id={`status-${checkpoint.id}`} value={status} onChange={(e) => { setStatus(e.target.value as CheckpointStatus); setConfirmed(false); }} disabled={busy} className="h-10 w-full rounded-lg border bg-background px-3 text-sm text-foreground">{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
      {status === "complete" && <div className="space-y-2">{checkpoint.evidence.length === 0 && <p className="text-xs text-amber-800">Add supporting evidence above before completing this checkpoint.</p>}<label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} disabled={busy} className="mt-1 accent-primary" /><span>I’ve reviewed the acceptance criteria and supporting evidence and confirm this checkpoint is complete.</span></label></div>}
      <Button size="sm" disabled={busy || (status === "complete" && (!confirmed || !checkpoint.evidence.length))}>Save progress</Button>
      {checkpoint.completedAt && <p className="flex items-center gap-2 text-xs text-primary"><CircleCheck size={14} />Manually confirmed on {new Date(checkpoint.completedAt).toLocaleDateString()}. Revisit when things change.</p>}
    </form></section>
    <section><h4 className="text-sm font-semibold">Revisit when…</h4><ul className="mt-3 list-disc space-y-2 pl-4 text-sm leading-6 text-muted-foreground">{checkpoint.reviewTriggers.map((trigger, index) => <li key={index}>{trigger}</li>)}</ul></section>
  </div>;
}
