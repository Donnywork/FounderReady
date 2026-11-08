import { CircleAlert, Clock3, TriangleAlert } from "lucide-react";
import type { Checkpoint } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const priorities = {
  P0: { label: "Critical", icon: TriangleAlert, style: "border-critical bg-critical-surface text-critical" },
  P1: { label: "Important", icon: CircleAlert, style: "border-warning bg-warning-surface text-warning" },
  P2: { label: "Can wait", icon: Clock3, style: "border-input bg-muted text-muted-foreground" },
};

export function PriorityBadge({ priority }: { priority: Checkpoint["priority"] }) {
  const { label, icon: Icon, style } = priorities[priority];
  return <span className={cn("inline-flex w-fit shrink-0 items-center gap-1.5 rounded-md border px-2 py-1 text-label", style)}><Icon aria-hidden="true" className="size-3.5" /><span>{priority} · {label}</span></span>;
}
