import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
export function Brand() {
  return <Link href="/" className="inline-flex items-center gap-2 text-card tracking-tight" aria-label="FounderReady home"><span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground"><ArrowUpRight aria-hidden="true" size={19} strokeWidth={2} /></span>FounderReady<span className="text-primary">.</span></Link>;
}
