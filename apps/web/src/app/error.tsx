"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main id="main" className="mx-auto max-w-xl space-y-6 px-5 py-16"><h1 className="page-title">Let’s try that again.</h1><p className="text-body text-muted-foreground">The workspace couldn’t load. Your saved progress is still there.</p><Button onClick={reset}>Try again</Button></main>;
}
