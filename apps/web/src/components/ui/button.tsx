import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
const buttonVariants = cva(
  "inline-flex max-w-full shrink-0 items-center justify-center gap-2 rounded-lg text-ui whitespace-normal transition-colors disabled:border-border disabled:bg-muted disabled:text-muted-foreground [&_svg]:size-4",
  { variants: {
    variant: { default: "bg-primary text-primary-foreground not-disabled:hover:bg-primary-hover", outline: "border border-input bg-surface text-primary not-disabled:hover:border-primary not-disabled:hover:bg-accent", ghost: "text-foreground not-disabled:hover:bg-accent", link: "text-primary underline underline-offset-4 not-disabled:hover:text-primary-hover" },
    size: { default: "min-h-11 px-4 py-2", sm: "min-h-10 px-3 py-2 text-nav", lg: "min-h-12 px-5 py-3", icon: "size-11" },
  }, defaultVariants: { variant: "default", size: "default" } },
);
export function Button({ className, variant, size, asChild = false, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
