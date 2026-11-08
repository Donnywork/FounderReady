"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Circle, CircleCheck, Clock3, LayoutList, Menu, MessageSquare, Plus, RotateCcw, X } from "lucide-react";
import { MAX_QUESTIONS, readiness, type ProjectDetail, type ProjectSummary } from "@/lib/contracts";
import { errorMessage, request } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Busy, ErrorNotice } from "./feedback";
import { QuestionForm } from "./question-form";
import { CheckpointPanel, statusLabels, type Mutate } from "./checkpoint-panel";

export function Workspace({ id }: { id: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [view, setView] = useState("overview");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [changes, setChanges] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([request<ProjectDetail>(`/api/projects/${id}`), request<{ projects: ProjectSummary[] }>("/api/projects")]).then(([detail, list]) => {
      if (active) { setProject(detail); setProjects(list.projects); setExpanded(detail.checkpoints[0]?.id ?? null); }
    }).catch((e) => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);
  const mutate: Mutate = async (path, body, method = "POST") => {
    setBusy(true); setError("");
    try {
      const detail = await request<ProjectDetail>(`/api/projects/${id}${path}`, { method, body });
      setProject(detail); setProjects((list) => list.map((p) => p.id === id ? { ...p, title: detail.title, phase: detail.phase } : p));
      if (!expanded && detail.checkpoints.length) setExpanded(detail.checkpoints[0].id);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      // An answer may have been persisted before the provider failed. Reload the retry state.
      try { setProject(await request<ProjectDetail>(`/api/projects/${id}`)); } catch { /* Keep the last loaded workspace. */ }
      return false;
    } finally { setBusy(false); }
  };
  const navigate = (next: string) => { setView(next); setMobileMenu(false); setError(""); };
  const progress = readiness(project?.checkpoints ?? []);
  const conversation = project?.conversations.find((c) => c.id === view);
  const followup = project?.followup;

  const sidebar = <>
    <div className="px-5 py-7"><Brand /></div>
    <div className="px-3"><Button asChild variant="outline" className="w-full justify-start bg-transparent"><Link href="/"><Plus />New project</Link></Button></div>
    <div className="mt-8 px-5"><p className="text-[10px] font-semibold tracking-[0.15em] text-muted-foreground uppercase">Your workspace</p><p className="mt-3 break-words text-sm font-medium leading-6">{project?.title ?? "Loading project…"}</p></div>
    <nav aria-label="Workspace" className="mt-4 space-y-1 px-3"><button onClick={() => navigate("overview")} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm", view === "overview" ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-accent/60")}><LayoutList size={17} />{project?.phase === "interview" ? "Getting started" : "Readiness overview"}</button>{project?.phase === "workspace" && <button onClick={() => navigate("followup")} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm", view === "followup" ? "bg-accent font-medium text-primary" : "text-muted-foreground hover:bg-accent/60")}><RotateCcw size={17} />Revisit your risks</button>}</nav>
    {projects.length > 1 && <div className="mt-7 px-5"><label htmlFor="project-switcher" className="text-xs text-muted-foreground">Switch project</label><select id="project-switcher" value={id} disabled={busy} onChange={(e) => router.push(`/workspace/${e.target.value}`)} className="mt-2 w-full rounded-lg border bg-background p-2 text-xs">{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></div>}
    <div className="mt-auto px-3 pt-12 pb-5"><h2 className="mb-3 flex items-center gap-2 px-2 text-[10px] font-semibold tracking-[0.12em] text-muted-foreground uppercase"><MessageSquare size={12} />Conversation history</h2><nav aria-label="Conversation history" className="max-h-60 space-y-1 overflow-y-auto">{project?.conversations.slice().reverse().map((c) => <button key={c.id} onClick={() => navigate(c.id)} className={cn("block w-full truncate rounded-lg px-2 py-2 text-left text-xs leading-5", view === c.id ? "bg-accent text-primary" : "text-muted-foreground hover:bg-accent/60")}>{c.title}</button>)}</nav></div>
    <div className="flex items-start gap-2 border-t px-5 py-5 text-xs leading-5 text-muted-foreground"><span className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-full bg-accent text-[10px] text-primary">G</span><p>Guest workspace<br /><span className="text-[10px]">Keep this browser to return. Clearing cookies removes access.</span></p></div>
  </>;

  return <div className="min-h-screen lg:flex">
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r bg-[#f5f6f0] lg:flex">{sidebar}</aside>
    <div className="border-b lg:hidden"><div className="flex items-center justify-between px-5 py-4"><Brand /><Button variant="ghost" size="icon" onClick={() => setMobileMenu(!mobileMenu)} aria-expanded={mobileMenu} aria-controls="mobile-nav" aria-label={mobileMenu ? "Close navigation" : "Open navigation"}>{mobileMenu ? <X /> : <Menu />}</Button></div>{mobileMenu && <aside id="mobile-nav" className="flex flex-col border-t bg-[#f5f6f0]">{sidebar}</aside>}</div>
    <div className="min-w-0 flex-1 lg:ml-64">
      <header className="flex min-h-20 items-center justify-between gap-3 border-b px-6 sm:px-10"><p className="text-xs text-muted-foreground">Your project <span className="mx-2 text-border">/</span><span className="text-foreground">{conversation ? "Conversation history" : view === "followup" ? "Follow-up" : project?.phase === "workspace" ? "Readiness" : "Getting started"}</span></p><Link href="/" className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground hover:text-primary">All projects <ArrowUpRight size={14} /></Link></header>
      <main id="main" className="mx-auto max-w-4xl px-6 pt-10 pb-20 sm:px-10 sm:pt-14">
        {loading && <div className="py-16"><Busy text="Opening your workspace…" /></div>}
        {error && <div className="mb-6"><ErrorNotice message={error} /></div>}
        {!loading && !project && <div className="space-y-5"><h1 className="font-serif text-3xl">We couldn’t open this workspace.</h1><p className="text-sm text-muted-foreground">Make sure you’re using the browser where you started this project.</p><div className="flex gap-3"><Button onClick={() => window.location.reload()}>Retry</Button><Button asChild variant="outline"><Link href="/">Back to projects</Link></Button></div></div>}
        {project && conversation && <section><p className="text-xs font-medium tracking-widest text-primary uppercase">Your conversation</p><h1 className="mt-4 font-serif text-3xl leading-tight sm:text-4xl">{conversation.title}</h1><p className="mt-4 text-xs text-muted-foreground">{new Date(conversation.createdAt).toLocaleDateString()} · Saved with your project</p><div className="mt-10 space-y-8">{conversation.messages.map((m) => <article key={m.id} className={cn("border-l-2 pl-5", m.role === "assistant" ? "border-primary/40" : "border-border")}><p className="mb-3 text-xs font-medium text-muted-foreground">{m.role === "user" ? "You" : "FounderReady"}</p><p className="whitespace-pre-wrap break-words text-sm leading-7">{m.content}</p></article>)}</div></section>}
        {project && view === "overview" && project.phase === "interview" && <section className="mx-auto max-w-xl py-3 sm:py-8">
          <p className="mb-8 text-xs font-medium tracking-widest text-primary uppercase">{project.pendingQuestion ? `Question ${project.answeredCount + 1} of up to ${MAX_QUESTIONS}` : project.answeredCount ? `${project.answeredCount} answers saved` : "Let’s get to know your product"}</p>
          <div className="mb-9 flex gap-2" aria-label={`${project.answeredCount} of ${MAX_QUESTIONS} questions answered`}>{Array.from({ length: MAX_QUESTIONS }, (_, i) => <span key={i} className={cn("h-1 flex-1 rounded-full", i < project.answeredCount ? "bg-primary" : "bg-border")} />)}</div>
          {project.pendingQuestion ? <QuestionForm key={project.pendingQuestion.id} question={project.pendingQuestion} busy={busy} onAnswer={(response) => mutate("/interview", { action: "answer", response })} submitLabel={project.answeredCount === MAX_QUESTIONS - 1 ? "Build my checkpoints" : "Continue"} /> : <div><h1 className="font-serif text-4xl leading-tight">{project.answeredCount ? "Let’s keep going." : "A little context goes a long way."}</h1><p className="mt-5 text-sm leading-7 text-muted-foreground">{project.answeredCount ? "Your answers are saved. Continue to generate your next question or readiness checkpoints." : "We’ll ask up to five questions about your product, then turn the important unknowns into clear next steps. “I don’t know” is always a useful answer."}</p>{!project.answeredCount && <blockquote className="mt-6 border-l-2 pl-4 text-sm leading-7 text-muted-foreground">{project.description}</blockquote>}<Button className="mt-8" disabled={busy} onClick={() => void mutate("/interview", { action: "next" })}>{project.answeredCount ? "Continue assessment" : "Start the questions"}<ArrowRight /></Button></div>}
          {busy && <div className="mt-6"><Busy text="Preparing your next step. This can take a moment…" /></div>}
          <div className="mt-10 border-t pt-5"><Button variant="link" className="h-auto p-0 text-xs" disabled={busy} onClick={() => void mutate("/interview", { action: "finish" })}>Build checkpoints from what I’ve shared</Button><p className="mt-2 text-xs leading-5 text-muted-foreground">You can finish early. Missing details will stay marked as unknown.</p></div>
        </section>}
        {project && view === "overview" && project.phase === "workspace" && <section>
          <p className="text-xs font-medium tracking-[0.15em] text-primary uppercase">Your readiness workspace</p><h1 className="mt-4 font-serif text-4xl leading-tight tracking-tight sm:text-5xl">A clearer next step.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-muted-foreground">{project.summary}</p>
          <div className="mt-9 border-y py-6"><div className="flex flex-wrap items-baseline justify-between gap-3"><p className="text-sm"><strong className="text-2xl font-medium text-primary">{progress.complete}<span className="text-base text-muted-foreground"> / {progress.total}</span></strong><span className="ml-3 text-muted-foreground">checkpoints confirmed</span></p><p className="text-xs text-muted-foreground">{progress.urgent ? `${progress.urgent} high-priority ${progress.urgent === 1 ? "item" : "items"} still open` : progress.complete === progress.total ? "Keep an eye on your review triggers" : "Keep working through your remaining checkpoints"}</p></div><div className="mt-4 h-1.5 overflow-hidden rounded-full bg-border" role="progressbar" aria-label="Manually confirmed checkpoints" aria-valuenow={progress.complete} aria-valuemin={0} aria-valuemax={progress.total}><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress.total ? progress.complete / progress.total * 100 : 0}%` }} /></div></div>
          {progress.needsReview > 0 && <p className="mt-5 flex gap-2 text-sm text-amber-800"><RotateCcw className="mt-0.5 size-4 shrink-0" />{progress.needsReview} {progress.needsReview === 1 ? "checkpoint needs" : "checkpoints need"} another look after your follow-up.</p>}
          <div className="mt-9 flex items-center justify-between"><h2 className="text-sm font-semibold">Your launch checkpoints</h2><span className="text-xs text-muted-foreground">Start at the top</span></div>
          <div className="mt-3 divide-y border-y">{project.checkpoints.map((checkpoint, index) => <section key={checkpoint.id}><button className="flex w-full items-start gap-4 py-6 text-left" aria-expanded={expanded === checkpoint.id} aria-controls={`checkpoint-${checkpoint.id}`} onClick={() => setExpanded(expanded === checkpoint.id ? null : checkpoint.id)}><span className="mt-0.5 flex size-6 shrink-0 items-center justify-center text-xs text-muted-foreground">{checkpoint.status === "complete" ? <CircleCheck size={21} className="text-primary" /> : String(index + 1).padStart(2, "0")}</span><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]"><span className={cn("font-medium", checkpoint.priority === "critical" ? "text-red-700" : checkpoint.priority === "high" ? "text-amber-800" : "text-muted-foreground")}>{checkpoint.priority === "critical" ? "Critical priority" : checkpoint.priority === "high" ? "High priority" : "Medium priority"}</span><span className="flex items-center gap-1 text-muted-foreground">{checkpoint.status === "complete" ? <Check size={11} /> : checkpoint.status === "in_progress" ? <Clock3 size={11} /> : checkpoint.status === "needs_review" ? <RotateCcw size={11} /> : <Circle size={9} />}{statusLabels[checkpoint.status]}</span></div><h3 className="text-base font-medium leading-6">{checkpoint.title}</h3>{checkpoint.owner && <p className="mt-2 text-xs text-muted-foreground">Owner: {checkpoint.owner}</p>}</div><ChevronDown size={17} className={cn("mt-3 shrink-0 text-muted-foreground transition-transform", expanded === checkpoint.id && "rotate-180")} /></button>{expanded === checkpoint.id && <div id={`checkpoint-${checkpoint.id}`}><CheckpointPanel key={`${checkpoint.id}-${checkpoint.status}-${checkpoint.owner}-${checkpoint.evidence.length}`} checkpoint={checkpoint} busy={busy} mutate={mutate} /></div>}</section>)}</div>
          {busy && <div className="mt-4"><Busy text="Saving your workspace…" /></div>}
          <p className="mt-6 text-xs leading-6 text-muted-foreground">Progress reflects your manual confirmations. This is technical guidance based on what you shared; it is not a security audit, legal advice, or launch certification.</p>
          <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-t pt-6"><div><h2 className="text-sm font-medium">Your product will change. Your plan should, too.</h2><p className="mt-2 text-xs text-muted-foreground">A new integration, more users, or a different kind of data?</p></div><Button variant="outline" onClick={() => navigate("followup")}><RotateCcw />Revisit your risks</Button></div>
        </section>}
        {project && view === "followup" && <section className="max-w-2xl"><p className="text-xs font-medium tracking-widest text-primary uppercase">A fresh look</p><h1 className="mt-4 font-serif text-4xl leading-tight">A good plan keeps up.</h1><p className="mt-5 text-sm leading-7 text-muted-foreground">Tell us what changed. We’ll ask a focused question and identify which checkpoints need another look.</p>
          {followup?.result && <div className="mt-8 border-y py-6"><h2 className="text-sm font-semibold">Your latest follow-up</h2><p className="mt-3 text-sm leading-7">{followup.result.summary}</p><ul className="mt-5 list-disc space-y-3 pl-5 text-sm leading-6">{followup.result.nextSteps.map((step, i) => <li key={i}>{step}</li>)}</ul>{followup.result.affectedCheckpointIds.length > 0 && <p className="mt-5 text-xs leading-5 text-muted-foreground">{followup.result.affectedCheckpointIds.length} existing checkpoints were flagged. Any that were complete are now marked “Needs review.”</p>}<Button variant="link" className="mt-4 px-0" onClick={() => navigate("overview")}>Review checkpoints <ArrowRight /></Button></div>}
          {followup && !followup.result ? <div className="mt-9"><p className="mb-6 border-l-2 pl-4 text-sm leading-6 text-muted-foreground">{followup.changes}</p>{followup.question && !followup.answer ? <QuestionForm key={followup.question.id} question={followup.question} busy={busy} onAnswer={(response) => mutate("/followup", { action: "answer", response })} submitLabel="Review my risks" /> : <div className="space-y-4"><p className="text-sm text-muted-foreground">{followup.answer ? "Your answer is saved. Continue to finish this review." : "Your update is saved. Continue to generate a follow-up question."}</p><Button disabled={busy} onClick={() => void mutate("/followup", { action: "retry" })}>Continue follow-up <ArrowRight /></Button></div>}</div> : <form className="mt-8" onSubmit={async (event) => { event.preventDefault(); if (await mutate("/followup", { action: "start", changes })) setChanges(""); }}><label htmlFor="changes" className="text-sm font-medium">{followup?.result ? "Anything else changing?" : "What’s new, or what are you unsure about?"}</label><Textarea id="changes" value={changes} onChange={(e) => setChanges(e.target.value)} placeholder="We’re adding document uploads, or inviting 500 more users…" minLength={10} maxLength={4000} required disabled={busy} className="mt-3 min-h-36 bg-white" /><Button type="submit" className="mt-5" disabled={busy || changes.trim().length < 10}>Start a follow-up <ArrowRight /></Button></form>}
          {busy && <div className="mt-6"><Busy text="Reviewing what changed…" /></div>}
        </section>}
      </main>
    </div>
  </div>;
}
