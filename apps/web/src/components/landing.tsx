"use client";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowUpRight } from "lucide-react";
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
    <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-6 sm:px-8"><Brand />{projects.length > 0 && <a href="#projects" className="flex min-h-11 items-center gap-2 text-nav text-primary underline underline-offset-4 hover:text-primary-hover">Your projects <ArrowUpRight aria-hidden="true" size={16} /></a>}</header>
    <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 pt-8 pb-16 sm:pt-12">
      <h1 className="page-title text-center">What are you building?</h1>
      <p className="mx-auto mt-4 max-w-xl text-center text-body text-muted-foreground">Tell us about your demo and the people who will use it. We’ll help you find the technical risks to work on next.</p>
      <form onSubmit={start} className="mt-8 rounded-xl border bg-surface p-4 sm:p-6">
        <label htmlFor="description" className="text-ui">Your project</label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="I built an AI customer-support chatbot using Lovable, Supabase, and OpenAI and want to invite my first 50 beta users…" required minLength={20} maxLength={4000} disabled={busy} className="mt-3 min-h-40" aria-describedby="description-help" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4"><span id="description-help" className="text-support text-muted-foreground">A few questions. A practical plan.</span><Button type="submit" size="lg" disabled={busy || description.trim().length < 20}>{busy ? "Opening your workspace…" : "Find my blind spots"}<ArrowRight /></Button></div>
      </form>
      <p className="mt-3 text-center text-support text-muted-foreground">Your description and answers are sent to OpenAI for guidance. Leave out secrets and personal customer data.</p>
      {error && <div className="mt-5"><ErrorNotice message={error} /></div>}
      {busy && <div className="mt-4 flex justify-center"><Busy text="Creating your private guest workspace…" /></div>}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-2"><span className="text-support text-muted-foreground">Not sure where to start?</span>{examples.map((example) => <button key={example.label} disabled={busy} onClick={() => { setDescription(example.text); document.getElementById("description")?.focus(); }} className="min-h-8 text-support font-medium text-primary underline underline-offset-4 hover:text-primary-hover disabled:text-muted-foreground">{example.label}</button>)}</div>
      {projects.length > 0 && <section id="projects" className="mt-10 scroll-mt-8"><h2 className="section-title mb-4">Pick up where you left off</h2><div className="divide-y border-y">{projects.map((p) => <Link key={p.id} href={`/workspace/${p.id}`} className="group flex items-center justify-between gap-4 rounded-md px-2 py-4 hover:bg-muted"><div className="min-w-0"><p className="card-title group-hover:text-primary">{p.title}</p><p className="mt-1 text-support text-muted-foreground">{p.phase === "interview" ? "Interview in progress" : "Readiness workspace"}</p></div><ArrowRight aria-hidden="true" size={18} className="text-primary" /></Link>)}</div></section>}
    </main>
    <footer className="mx-auto flex w-full max-w-7xl flex-wrap justify-between gap-3 border-t px-5 py-6 text-support text-muted-foreground sm:px-8"><p>Built for the step between demo and launch.</p><p>No account needed. Saved in this browser’s guest session.</p></footer>
  </div>;
}
