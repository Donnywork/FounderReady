"use client";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import type { Answer, Question } from "@/lib/contracts";
import { Button } from "./ui/button";
import { Textarea } from "./ui/textarea";

export function QuestionForm({ question, busy, onAnswer, submitLabel = "Continue" }: { question: Question; busy: boolean; onAnswer: (answer: Answer) => Promise<boolean>; submitLabel?: string }) {
  const [answer, setAnswer] = useState("");
  function submit(disposition: Answer["disposition"]) { return onAnswer({ questionId: question.id, disposition, answer: disposition === "answered" ? answer : "" }); }
  return <form onSubmit={(event) => { event.preventDefault(); void submit("answered"); }}>
    <h1 className="page-title text-section">{question.text}</h1>
    <p className="page-intro">{question.explanation}</p>
    {question.suggestions.length > 0 && <div className="mt-6 flex flex-wrap gap-2">{question.suggestions.map((suggestion, index) => <button type="button" key={index} disabled={busy} aria-pressed={answer === suggestion} onClick={() => setAnswer(suggestion)} className={`min-h-11 rounded-lg border px-3 py-2 text-left text-ui transition-colors hover:bg-accent disabled:border-border disabled:bg-muted disabled:text-muted-foreground ${answer === suggestion ? "border-primary bg-accent font-semibold text-primary" : "border-input bg-surface"}`}>{suggestion}</button>)}</div>}
    <label htmlFor={`answer-${question.id}`} className="mt-6 mb-2 block text-ui">Your answer</label>
    <Textarea id={`answer-${question.id}`} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Share what you know. It’s okay if you’re still figuring it out." maxLength={4000} disabled={busy} className="min-h-32" />
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-1"><Button type="button" variant="ghost" disabled={busy} onClick={() => void submit("unknown")}>I don’t know</Button><Button type="button" variant="ghost" disabled={busy} onClick={() => void submit("skipped")}>Skip</Button></div><Button type="submit" disabled={busy || !answer.trim()}>{submitLabel}<ArrowRight /></Button></div>
  </form>;
}
