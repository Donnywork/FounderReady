"use client";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import type { Conversation, ProjectDetail } from "@/lib/contracts";
import type { Mutate } from "./checkpoint-panel";
import { ConversationView } from "./conversation";
import { Busy, ErrorNotice } from "./feedback";
import { Button } from "./ui/button";

// A non-modal companion to the map: keyboard users can move between both areas.
// Below xl it occupies the page and uses the same conversation view.
export function ExplorationPanel({ conversation, project, busy, error, mutate, close }: {
  conversation: Conversation; project: ProjectDetail; busy: boolean; error: string; mutate: Mutate; close: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeButton.current?.focus(); }, [conversation.id]);
  return <aside aria-label="Readiness exploration" className="min-w-0 xl:sticky xl:top-0 xl:h-[calc(100dvh-4rem)] xl:overflow-y-auto xl:border-l xl:bg-surface" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } }}>
    <div className="sticky top-0 z-10 border-b bg-background px-5 py-3 sm:px-8 xl:bg-surface"><div className="flex items-center justify-between gap-4"><p className="text-label text-muted-foreground">Readiness exploration</p><Button ref={closeButton} variant="ghost" size="icon" onClick={close} aria-label="Close exploration"><X aria-hidden="true" /></Button></div>{error && <div className="mt-3"><ErrorNotice message={error} /></div>}</div>
    <div className="px-5 py-6 sm:px-8"><ConversationView key={conversation.id} conversation={conversation} project={project} busy={busy} mutate={mutate} /></div>
    {busy && <div className="sticky bottom-0 border-t bg-surface px-5 py-4 sm:px-8"><Busy text="Your advisor is working…" /></div>}
  </aside>;
}
