import { LoaderCircle, TriangleAlert } from "lucide-react";
export function ErrorNotice({ message }: { message: string }) {
  return <div role="alert" className="flex items-start gap-3 rounded-lg border border-warning bg-warning-surface p-4 text-body text-warning"><TriangleAlert aria-hidden="true" className="mt-1 size-5" /><span>{message}</span></div>;
}
export function Busy({ text = "Thinking through your product…" }: { text?: string }) {
  return <div role="status" className="flex items-center gap-2 text-support text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-4 animate-spin" />{text}</div>;
}
