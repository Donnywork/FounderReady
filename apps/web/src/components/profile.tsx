"use client";
import { useState } from "react";
import type { ProjectDetail, Fact } from "@/lib/contracts";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import type { Mutate } from "./checkpoint-panel";

export function ProjectProfile({ project, busy, mutate }: { project: ProjectDetail; busy: boolean; mutate: Mutate }) {
  const [title, setTitle] = useState(project.title);
  const [summary, setSummary] = useState(project.summary);
  const [facts, setFacts] = useState(project.facts);
  const initial = project.phase === "profile";
  function change(index: number, patch: Partial<Fact>) { setFacts((list) => list.map((f, i) => i === index ? { ...f, ...patch } : f)); }
  return <section>
    <h1 className="page-title">{initial ? "Does this sound right?" : "Project profile"}</h1>
    <p className="page-intro">{initial ? "Review what we know before we choose your first checkpoints. Keep assumptions and unknowns labeled as they are." : "This context is shared across every conversation. For a material change, tell the advisor so it can propose a targeted impact review."}</p>
    <form className="mt-6 space-y-6" onSubmit={(e) => { e.preventDefault(); void mutate("/profile", { title, summary, facts: facts.map(({ key, label, value, provenance, confidence }) => ({ key, label, value, provenance, confidence })), approve: initial }); }}>
      <label className="block space-y-2 text-ui">Project name<Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={80} disabled={busy} title={title} /></label>
      <label className="block space-y-2 text-ui">Summary<Textarea value={summary} onChange={(e) => setSummary(e.target.value)} required minLength={20} maxLength={1600} disabled={busy} /></label>
      <div className="divide-y border-y">{facts.map((fact, i) => <div key={fact.key} className="py-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><label htmlFor={`fact-${fact.key}`} className="text-ui">{fact.label}</label><select aria-label={`Provenance for ${fact.label}`} className="form-control sm:w-auto" value={fact.provenance} disabled={busy} onChange={(e) => change(i, { provenance: e.target.value as Fact["provenance"] })}><option value="founder_reported">Founder-reported / confirmed</option><option value="ai_inferred">AI-inferred</option><option value="unknown">Unknown</option></select></div>
        <Textarea id={`fact-${fact.key}`} value={fact.value} required minLength={1} maxLength={1600} disabled={busy} onChange={(e) => change(i, { value: e.target.value })} className="min-h-20" />
        <p className="mt-2 text-support text-muted-foreground">{fact.provenance === "unknown" ? "An open question, not an affirmative claim." : fact.provenance === "ai_inferred" ? "An assumption to check with your builder." : "Reported by you; this does not establish that it has been tested."}</p>
      </div>)}</div>
      <Button disabled={busy || facts.length < 7} type="submit">{initial ? "Approve profile & build checkpoints" : "Save profile"}</Button>
      {!facts.length && <p className="text-body text-muted-foreground">This project predates profiles. Start a conversation to add known project facts through proposed updates.</p>}
    </form>
  </section>;
}
