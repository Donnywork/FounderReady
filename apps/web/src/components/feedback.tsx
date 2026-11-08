import { LoaderCircle, TriangleAlert } from "lucide-react";
export function ErrorNotice({ message }: { message: string }) {
  return <div role="alert" className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950"><TriangleAlert className="mt-0.5 size-4 shrink-0" /><span>{message}</span></div>;
}
export function Busy({ text = "Thinking through your product…" }: { text?: string }) {
  return <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="size-4 animate-spin" />{text}</div>;
}
