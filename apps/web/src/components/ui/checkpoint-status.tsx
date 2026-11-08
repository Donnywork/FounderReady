import { CircleAlert, CircleCheck, CircleHelp, CircleMinus, ClipboardCheck, Clock3, Eye, TriangleAlert } from "lucide-react";
import { statusLabels, dispositionLabels, type Checkpoint } from "@/lib/contracts";
import { cn } from "@/lib/utils";

const statusIcons = { unknown: CircleHelp, needs_action: TriangleAlert, planned: Clock3, implemented_unverified: Eye, evidence_reviewed: ClipboardCheck, founder_confirmed: CircleCheck };
const dispositionIcons = { deferred: Clock3, risk_accepted: CircleAlert, not_applicable: CircleMinus };

export function Status({ checkpoint: c }: { checkpoint: Checkpoint }) {
  const Icon = c.disposition === "active" ? statusIcons[c.status] : dispositionIcons[c.disposition];
  const tone = c.disposition === "not_applicable" ? "text-muted-foreground" : c.disposition !== "active" || c.status === "needs_action" ? "text-warning" : c.status === "founder_confirmed" ? "text-primary" : "text-muted-foreground";
  return <span className={cn("inline-flex items-start gap-1.5 text-support font-medium", tone)}><Icon aria-hidden="true" className="mt-0.5 size-4" /><span>{c.disposition === "active" ? statusLabels[c.status] : dispositionLabels[c.disposition]}</span></span>;
}
