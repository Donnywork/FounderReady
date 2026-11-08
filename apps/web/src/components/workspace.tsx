"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, LayoutList, Menu, MessageSquare, Plus, X, Network, FileText } from "lucide-react";
import { MAX_QUESTIONS, readiness, nextActions, priorityRank, type Checkpoint, type Domain, type ProjectDetail, type ProjectSummary } from "@/lib/contracts";
import { errorMessage, request } from "@/lib/client";
import { cn } from "@/lib/utils";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { Busy, ErrorNotice } from "./feedback";
import { QuestionForm } from "./question-form";
import { CheckpointPanel, type Mutate } from "./checkpoint-panel";
import { ProjectProfile } from "./profile";
import { ReadinessMap } from "./readiness-map";
import { Status } from "./ui/checkpoint-status";
import { PriorityBadge } from "./ui/priority-badge";
import { Proposal } from "./proposals";
import { ConversationView } from "./conversation";
import { ExplorationPanel } from "./exploration-panel";

export function Workspace({ id }: { id: string }) {
  const router = useRouter();
  const [project, setProject] = useState<ProjectDetail | null>(null); const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const [view, setView] = useState("dashboard"); const [mobileMenu, setMobileMenu] = useState(false);
  const returnFocus = useRef<HTMLElement | null>(null);
  const mutating = useRef(false);
  useEffect(() => {
    let active = true;
    const hash = () => setView(window.location.hash.slice(1) || "dashboard"); hash(); window.addEventListener("hashchange", hash);
    Promise.all([request<ProjectDetail>(`/api/projects/${id}`), request<{ projects: ProjectSummary[] }>("/api/projects")]).then(([detail, list]) => { if (active) { setProject(detail); setProjects(list.projects); } }).catch((e) => { if (active) setError(errorMessage(e)); }).finally(() => { if (active) setLoading(false); });
    window.addEventListener("popstate", hash);
    return () => { active = false; window.removeEventListener("hashchange", hash); window.removeEventListener("popstate", hash); };
  }, [id]);
  function navigate(next: string) { window.history.pushState(null, "", `#${next}`); setView(next); setMobileMenu(false); setError(""); }
  const mutate: Mutate = async (path, body, method = "POST") => {
    if (mutating.current) return false;
    mutating.current = true;
    setBusy(true); setError("");
    try {
      let detail = await request<ProjectDetail & { conversationId?: string }>(`/api/projects/${id}${path}`, { method, body });
      setProject(detail); setProjects((list) => list.map((p) => p.id === id ? { ...p, title: detail.title, phase: detail.phase } : p));
      if (path === "/conversations" && (body as { action?: string }).action === "create" && detail.conversationId) {
        const created = detail.conversations.find((c) => c.id === detail.conversationId)!;
        navigate(`${created.exploration ? "explore" : "chat"}-${created.id}`);
        if (created.exploration) {
          detail = await request<ProjectDetail>(`/api/projects/${id}/conversations`, { method: "POST", body: { action: "retry", conversationId: created.id } });
          setProject(detail);
        }
      }
      if (project?.phase === "profile" && detail.phase === "workspace") navigate("dashboard");
      return true;
    } catch (e) {
      setError(errorMessage(e));
      try { setProject(await request<ProjectDetail>(`/api/projects/${id}`)); } catch { /* Preserve the last loaded state. */ }
      return false;
    } finally { mutating.current = false; setBusy(false); }
  };
  const newChat = (checkpointId: string | null = null) => void mutate("/conversations", { action: "create", checkpointId });
  const progress = readiness(project?.checkpoints ?? []);
  const pending = project?.proposals.filter((p) => p.state === "pending" || p.state === "deferred") ?? [];
  const conversation = project?.conversations.find((c) => `chat-${c.id}` === view);
  const exploration = project?.conversations.find((c) => c.exploration && `explore-${c.id}` === view);
  const mapVisible = view === "map" || !!exploration;
  function explore(domain: Domain | null) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void mutate("/conversations", { action: "create", exploration: { domain } });
  }
  function closeExploration() {
    navigate("map");
    requestAnimationFrame(() => { (returnFocus.current?.isConnected ? returnFocus.current : document.getElementById("explore-blind-spots"))?.focus(); });
  }
  const checkpoint = project?.checkpoints.find((c) => `checkpoint-${c.id}` === view);
  const sourceConversationId = checkpoint?.events.findLast((e) => typeof e.detail.conversationId === "string")?.detail.conversationId;
  const supportingConversation = project?.conversations.find((c) => c.id === sourceConversationId);
  const due = project?.checkpoints.filter((c) => c.triggers.some((t) => !t.resolvedAt && t.dueAt && new Date(t.dueAt) <= new Date())) ?? [];
  const navItems = [{ key: "dashboard", label: "Checklist", icon: LayoutList }, { key: "map", label: "Readiness map", icon: Network }, { key: "profile", label: "Project profile", icon: FileText }];
  const sidebar = <>
    <div className="px-5 py-6"><Brand /></div><div className="px-3"><Button asChild variant="outline" className="w-full justify-start"><Link href="/"><Plus />New project</Link></Button></div>
    <div className="mt-6 px-5"><p className="text-label text-muted-foreground">Your project</p><p className="mt-2 text-ui font-semibold">{project?.title ?? "Loading…"}</p></div>
    <nav aria-label="Workspace" className="mt-4 space-y-1 px-3">{project?.phase === "workspace" ? <>{navItems.map(({ key, label, icon: Icon }) => <button key={key} aria-current={view === key || key === "map" && exploration ? "page" : undefined} onClick={() => navigate(key)} className="nav-item"><Icon aria-hidden="true" size={18} />{label}</button>)}<button disabled={busy} onClick={() => newChat()} className="nav-item"><MessageSquare aria-hidden="true" size={18} />New conversation</button></> : <button aria-current="page" onClick={() => navigate("dashboard")} className="nav-item">Getting started</button>}</nav>
    {projects.length > 1 && <label className="mt-6 px-5 text-label text-muted-foreground">Switch project<select value={id} disabled={busy} onChange={(e) => router.push(`/workspace/${e.target.value}`)} className="form-control mt-2">{projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}</select></label>}
    <div className="mt-8 px-3 pb-4"><h2 className="mb-2 px-2 text-label text-muted-foreground">Past conversations</h2><nav aria-label="Conversation history" className="max-h-72 space-y-1 overflow-y-auto p-1">{project?.conversations.slice().reverse().map((c) => <button key={c.id} title={c.title} aria-current={view === `chat-${c.id}` || view === `explore-${c.id}` ? "page" : undefined} onClick={() => { returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; navigate(`${c.exploration ? "explore" : "chat"}-${c.id}`); }} className="nav-item items-start text-support">{c.title}</button>)}</nav></div>
    <p className="mt-auto border-t px-5 py-4 text-support text-muted-foreground">Guest workspace<br />Keep this browser to return. Clearing cookies removes access.</p>
  </>;
  const openCheckpoint = (checkpointId: string) => navigate(`checkpoint-${checkpointId}`);
  function row(c: Checkpoint, showReason = false) {
    return <button key={c.id} onClick={() => openCheckpoint(c.id)} className="checkpoint-row"><div className="min-w-0 flex-1"><div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2"><PriorityBadge priority={c.priority} /><Status checkpoint={c} /></div><h3 className="card-title">{c.title}</h3>{showReason && <p className="mt-2 text-body text-muted-foreground">{c.reasoning}</p>}</div><ArrowRight aria-hidden="true" className="mt-2 size-5 text-primary" /></button>;
  }
  return <div className="min-h-screen lg:flex">
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto border-r bg-sidebar lg:flex">{sidebar}</aside>
    <div className="border-b lg:hidden"><div className="flex items-center justify-between px-5 py-4"><Brand /><Button variant="ghost" size="icon" onClick={() => setMobileMenu(!mobileMenu)} aria-expanded={mobileMenu} aria-controls="mobile-nav" aria-label={mobileMenu ? "Close navigation" : "Open navigation"}>{mobileMenu ? <X /> : <Menu />}</Button></div>{mobileMenu && <aside id="mobile-nav" className="flex flex-col border-t bg-sidebar">{sidebar}</aside>}</div>
    <div className="min-w-0 flex-1 lg:ml-64"><header className="flex min-h-16 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b px-5 py-3 sm:px-8"><nav aria-label="Breadcrumb" className="text-support text-muted-foreground"><span>Your project</span><span aria-hidden="true" className="mx-2">/</span><span aria-current="page" className="font-medium text-foreground">{checkpoint ? "Checkpoint" : exploration ? "Readiness map" : conversation ? "Conversation" : navItems.find((n) => n.key === view)?.label ?? (view === "updates" ? "Updates to review" : "Getting started")}</span></nav>{pending.length > 0 && <button onClick={() => navigate("updates")} className="min-h-8 text-support font-medium text-primary underline underline-offset-4 hover:text-primary-hover">{pending.length} updates to review</button>}</header>
      <main id="main" className={cn("mx-auto", exploration ? "max-w-[1600px] xl:grid xl:grid-cols-[minmax(0,1fr)_minmax(480px,0.95fr)]" : "max-w-4xl")}>
        <div className={cn("min-w-0 px-5 pt-8 pb-16 sm:px-8 sm:pt-10", exploration && "hidden xl:block")}>
        {loading && <Busy text="Opening your workspace…" />}{error && !exploration && <div className="mb-6"><ErrorNotice message={error} /></div>}
        {!loading && !project && <div className="space-y-4"><h1 className="page-title">We couldn’t open this workspace.</h1><p className="text-body text-muted-foreground">Use the browser where you started this project.</p><Button onClick={() => window.location.reload()}>Retry</Button></div>}
        {project && conversation && <ConversationView key={conversation.id} conversation={conversation} project={project} busy={busy} mutate={mutate} />}
        {project && !conversation && project.phase === "interview" && <section className="mx-auto max-w-xl py-4">
          <p className="mb-4 text-label text-primary">{project.pendingQuestion ? `Question ${project.answeredCount + 1} of up to ${MAX_QUESTIONS}` : `${project.answeredCount} answers saved`}</p><div role="progressbar" aria-valuemin={0} aria-valuemax={MAX_QUESTIONS} aria-valuenow={project.answeredCount} className="mb-6 flex gap-2" aria-label={`${project.answeredCount} of ${MAX_QUESTIONS} questions answered`}>{Array.from({ length: MAX_QUESTIONS }, (_, i) => <span key={i} className={cn("h-1.5 flex-1 rounded-full", i < project.answeredCount ? "bg-primary" : "border border-input")} />)}</div>
          {project.pendingQuestion ? <QuestionForm key={project.pendingQuestion.id} question={project.pendingQuestion} busy={busy} onAnswer={(response) => mutate("/interview", { action: "answer", response })} submitLabel={project.answeredCount === MAX_QUESTIONS - 1 ? "Review project profile" : "Continue"} /> : <div><h1 className="page-title">A little context goes a long way.</h1><p className="page-intro">Up to five questions will help us choose your next steps. “I don’t know” is a useful answer. Your answers are saved as you go.</p><blockquote className="mt-4 border-l-2 border-input pl-4 text-body text-muted-foreground">{project.description}</blockquote><Button className="mt-6" disabled={busy} onClick={() => void mutate("/interview", { action: "next" })}>{project.answeredCount ? "Continue interview" : "Start the questions"}<ArrowRight /></Button></div>}
          <div className="mt-8 border-t pt-4"><Button variant="link" className="p-0 text-support" disabled={busy} onClick={() => void mutate("/interview", { action: "finish" })}>Review profile from what I’ve shared</Button><p className="mt-2 text-support text-muted-foreground">Finish early; missing details stay unknown.</p></div>
        </section>}
        {project && !conversation && (project.phase === "profile" || project.phase === "workspace" && view === "profile") && <ProjectProfile key={project.phase} project={project} busy={busy} mutate={mutate} />}
        {project?.phase === "workspace" && view === "dashboard" && <section><h1 className="page-title">Your next steps</h1><p className="page-intro">Focus on the work that matters before more people depend on your product.</p>
          <div className="mt-6 border-y py-4"><p className="text-body"><strong className="text-section">{progress.complete} of {progress.total}</strong> checkpoints founder-confirmed</p><p className="mt-3 text-support text-muted-foreground"><span className={cn(progress.critical > 0 && "font-semibold text-critical")}>{progress.critical} unresolved P0</span> · {progress.pending} pending · {project.facts.filter((f) => f.provenance === "unknown").length} unknown facts · {progress.accepted} risk accepted</p><p className="mt-2 text-support text-muted-foreground">This tracks verification progress. New findings can add checkpoints and reduce the confirmed share. Accepted and deferred risks are not verified.</p></div>
          {due.length > 0 && <div className="mt-6"><h2 className="section-title text-warning">Reviews due ({due.length})</h2>{due.map((c) => <button key={c.id} onClick={() => openCheckpoint(c.id)} className="mt-2 block min-h-11 text-left text-ui text-primary underline underline-offset-4 hover:text-primary-hover">{c.title}</button>)}</div>}
          {pending.length > 0 && <button onClick={() => navigate("updates")} className="mt-4 min-h-11 text-left text-ui text-primary underline underline-offset-4 hover:text-primary-hover">Review {pending.length} proposed project updates</button>}
          <h2 className="section-title mt-8">Top three next actions</h2><div className="mt-4 divide-y border-y">{nextActions(project.checkpoints, project.relations).map((c) => row(c, true))}{!nextActions(project.checkpoints, project.relations).length && <p className="py-4 text-body text-muted-foreground">No active actions. Check due reviews and revisit accepted or deferred risks as your product changes.</p>}</div>
          <h2 className="section-title mt-8">All checkpoints</h2><p className="mt-2 text-support text-muted-foreground">P0: critical before beta or explicitly risk-accepted · P1: important soon · P2: can wait</p><div className="mt-4 divide-y border-y">{[...project.checkpoints].sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]).map((c) => row(c))}</div>
          <p className="mt-6 text-support text-muted-foreground">Guidance based on what you share, not a security audit, legal advice, or certification.</p>
        </section>}
        {project?.phase === "workspace" && mapVisible && <ReadinessMap project={project} openCheckpoint={openCheckpoint} explore={explore} busy={busy} />}
        {project?.phase === "workspace" && checkpoint && <><Button variant="link" className="mb-6 px-0" onClick={() => navigate("dashboard")}><ArrowLeft />Checklist</Button><CheckpointPanel key={`${checkpoint.id}-${checkpoint.status}-${checkpoint.disposition}-${checkpoint.evidence.length}`} checkpoint={checkpoint} busy={busy} mutate={mutate} chat={() => newChat(checkpoint.id)} supportingConversation={supportingConversation} /></>}
        {project?.phase === "workspace" && view === "updates" && <section><h1 className="page-title">Updates to review</h1><p className="page-intro">Review each change before it becomes part of your project. New checkpoints must be approved before links that depend on them.</p><div className="mt-6 space-y-6">{pending.map((p) => <Proposal key={p.id} proposal={p} busy={busy} mutate={mutate} />)}{!pending.length && <p className="text-body text-muted-foreground">You’re up to date. No proposed changes are waiting.</p>}</div><details className="mt-8"><summary className="min-h-11 text-ui">Past decisions</summary><div className="mt-4 space-y-4">{project.proposals.filter((p) => p.state === "approved" || p.state === "rejected").map((p) => <Proposal key={p.id} proposal={p} busy={busy} mutate={mutate} />)}</div></details></section>}
        {busy && !exploration && <div className="sticky bottom-4 mt-6 rounded-lg border bg-background/95 p-4 shadow-sm"><Busy text="Preparing your next step. Your saved progress is safe…" /></div>}
        </div>
        {project && exploration && <ExplorationPanel conversation={exploration} project={project} busy={busy} error={error} mutate={mutate} close={closeExploration} />}
      </main>
    </div>
  </div>;
}
