"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight, Check, MessageSquare, ListChecks } from "lucide-react";
import type { ProjectSummary } from "@/lib/contracts";
import { errorMessage, request } from "@/lib/client";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";
import { Busy, ErrorNotice } from "./feedback";

const examples = [
  { label: "Unexpected AI costs", text: "I'm building an AI writing assistant with a paid model API. Users can generate as much content as they want, and I'm worried about unexpected costs." },
  { label: "Website outages", text: "I've built a booking website for local businesses. I'm about to invite my first 100 users, and I don't know what happens if the website goes down." },
  { label: "Prompt injection & data leaks", text: "I'm building an AI assistant that answers questions about documents uploaded by different customers. I'm worried about prompt injection and private data leaking between customers." },
];
export function Landing() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { let active = true; request<{ projects: ProjectSummary[] }>("/api/projects").then((data) => { if (active) setProjects(data.projects); }).catch((e) => { if (active) setError(errorMessage(e)); }); return () => { active = false; }; }, []);
  async function start(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { const data = await request<{ project: ProjectSummary }>("/api/projects", { method: "POST", body: { description } }); router.push(`/workspace/${data.project.id}`); }
    catch (e) { setError(errorMessage(e)); setBusy(false); }
  }
  return <div className="flex min-h-screen flex-col">
    <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-7 sm:px-10"><Brand />{projects.length > 0 && <a href="#projects" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">Your projects <ArrowUpRight size={16} /></a>}</header>
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-6 pt-16 pb-20 sm:pt-24">
      <p className="mb-6 text-center text-xs font-medium tracking-[0.18em] text-primary uppercase">A clearer path to your first users</p>
      <h1 className="text-center font-serif text-[clamp(2.7rem,6vw,4.7rem)] leading-[1.08] tracking-[-0.045em]">Your demo works.<br /><span className="text-primary">What happens next?</span></h1>
      <p className="mx-auto mt-7 max-w-lg text-center text-base leading-7 text-muted-foreground sm:text-lg">Turn the technical unknowns into a plan.<br className="hidden sm:block" /> Find your biggest launch risks—and know what to do next.</p>
      <form onSubmit={start} className="mt-11 rounded-2xl border bg-white p-5 shadow-[0_4px_24px_-16px_rgba(32,55,40,0.25)] sm:p-6">
        <label htmlFor="description" className="text-sm font-medium">What are you building?</label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="A little about your product, who it’s for, and what you’re unsure about…" required minLength={20} maxLength={4000} disabled={busy} className="mt-3 min-h-28 resize-none border-0 bg-white px-0 text-base shadow-none focus-visible:ring-0" aria-describedby="description-help" />
        <div className="flex flex-wrap items-center justify-between gap-4 border-t pt-4"><span id="description-help" className="text-xs text-muted-foreground">A few questions. A practical plan.</span><Button type="submit" size="lg" disabled={busy || description.trim().length < 20}>{busy ? "Opening your workspace…" : "Find my blind spots"}<ArrowRight /></Button></div>
      </form>
      <p className="mt-3 text-center text-xs leading-5 text-muted-foreground">Your description and answers are sent to OpenAI for guidance. Leave out secrets and personal customer data.</p>
      {error && <div className="mt-5"><ErrorNotice message={error} /></div>}
      {busy && <div className="mt-4 flex justify-center"><Busy text="Creating your private guest workspace…" /></div>}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-3"><span className="text-xs text-muted-foreground">Not sure where to start?</span>{examples.map((example) => <button key={example.label} disabled={busy} onClick={() => { setDescription(example.text); document.getElementById("description")?.focus(); }} className="text-xs text-primary underline decoration-primary/25 underline-offset-4 hover:decoration-primary">{example.label}</button>)}</div>
      <div className="mt-16 grid gap-7 border-t pt-8 sm:grid-cols-3">{[
        { icon: MessageSquare, title: "Tell us the basics", description: "No technical vocabulary needed." },
        { icon: ListChecks, title: "Focus on what matters", description: "3–5 checkpoints, in priority order." },
        { icon: Check, title: "Make progress visible", description: "Clear actions. Evidence you can revisit." },
      ].map(({ icon: Icon, title, description }) => <div key={title}><Icon size={18} strokeWidth={1.5} className="mb-3 text-primary" /><h2 className="text-sm font-medium">{title}</h2><p className="mt-2 text-xs leading-5 text-muted-foreground">{description}</p></div>)}</div>
      {projects.length > 0 && <section id="projects" className="mt-16 scroll-mt-8"><h2 className="mb-3 text-sm font-medium">Pick up where you left off</h2><div className="divide-y border-y">{projects.map((p) => <Link key={p.id} href={`/workspace/${p.id}`} className="group flex items-center justify-between gap-4 py-4"><div><p className="text-sm font-medium group-hover:text-primary">{p.title}</p><p className="mt-1 text-xs text-muted-foreground">{p.phase === "interview" ? "Interview in progress" : "Readiness workspace"}</p></div><ArrowRight size={16} className="shrink-0 text-muted-foreground" /></Link>)}</div></section>}
    </main>
    <footer className="mx-auto flex w-full max-w-7xl flex-wrap justify-between gap-3 border-t px-6 py-6 text-xs text-muted-foreground sm:px-10"><p>Built for the step between demo and launch.</p><p>No account needed. Saved in this browser’s guest session.</p></footer>
  </div>;
}
