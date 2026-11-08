"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp } from "lucide-react";
import { domains, type Conversation, type ProjectDetail } from "@/lib/contracts";
import { cn } from "@/lib/utils";
import type { Mutate } from "./checkpoint-panel";
import { Proposal } from "./proposals";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function ConversationView({ conversation, project, busy, mutate }: { conversation: Conversation; project: ProjectDetail; busy: boolean; mutate: Mutate }) {
  const [content, setContent] = useState("");
  const composer = useRef<HTMLTextAreaElement>(null);
  const latest = useRef<HTMLDivElement>(null);
  const previousCount = useRef(conversation.messages.length);
  useEffect(() => {
    if (conversation.messages.length > previousCount.current) latest.current?.scrollIntoView({ block: "nearest" });
    previousCount.current = conversation.messages.length;
  }, [conversation.messages.length]);
  const pending = conversation.messages.at(-1)?.role === "user";
  const checkpoint = project.checkpoints.find((c) => c.id === conversation.checkpointId);
  const exploration = conversation.exploration;
  function discuss(prompt: string) { setContent(prompt); composer.current?.focus(); composer.current?.scrollIntoView({ block: "nearest" }); }
  return <section className="max-w-3xl"><h1 className="page-title text-section">{conversation.title}</h1><p className="page-intro">{exploration ? `Explore ${exploration.domain ? domains[exploration.domain] : "blind spots across your project"} using your current profile, risks and checkpoints. Ask anything, add context, or challenge a suggestion.` : `Project facts and checkpoints are available in this conversation.${checkpoint ? ` Focus: ${checkpoint.title}.` : ""}`}</p>
    <div className="mt-6 space-y-6">{conversation.messages.map((m) => <article key={m.id}><div className={cn("border-l-2 pl-4", m.role === "assistant" ? "border-primary" : "border-input")}><p className="mb-2 text-label text-muted-foreground">{m.role === "user" ? "You" : "FounderReady"}</p><p className="whitespace-pre-wrap text-body">{m.content}</p></div><div className="mt-4 space-y-4">{project.proposals.filter((p) => p.messageId === m.id).map((p) => <Proposal key={p.id} proposal={p} busy={busy} mutate={mutate} discovery={!!exploration} discuss={discuss} />)}</div></article>)}</div>
    <div ref={latest} />
    {conversation.kind !== "interview" && <div className="mt-6 border-t pt-6">{pending ? <div><p role="status" className="text-body text-muted-foreground">Your message is saved.{busy ? " The advisor is working on a response." : " Continue to get the advisor’s response."}</p><Button className="mt-4" disabled={busy} onClick={() => void mutate("/conversations", { action: "retry", conversationId: conversation.id })}>Retry saved message</Button></div> : <form onSubmit={async (e) => { e.preventDefault(); if (await mutate("/conversations", { action: "send", conversationId: conversation.id, content })) setContent(""); }}>
      {!conversation.messages.length && <div className="mb-6 flex flex-wrap gap-2">{["Something changed", "Explain a risk", "Review readiness"].map((label) => <Button key={label} type="button" size="sm" variant="outline" disabled={busy} onClick={() => setContent(label === "Something changed" ? "I just added " : label === "Explain a risk" ? "Can you explain the highest-priority risk in plain language?" : "What should I focus on before inviting users?")}>{label}</Button>)}</div>}
      <label htmlFor="chat-message" className="text-ui">Ask your advisor</label><Textarea ref={composer} id="chat-message" className="mt-2 min-h-32" value={content} onChange={(e) => setContent(e.target.value)} maxLength={4000} required disabled={busy} placeholder="Ask a question, describe a change, or work through a concern…" /><div className="mt-4 flex flex-wrap items-center justify-between gap-4"><p className="text-support text-muted-foreground">Proposed project changes always need your approval.</p><Button disabled={busy || !content.trim()}>Send message<ArrowUp aria-hidden="true" /></Button></div>
    </form>}</div>}
  </section>;
}
