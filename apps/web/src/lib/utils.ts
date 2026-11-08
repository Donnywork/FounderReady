import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";
// Keep semantic font sizes distinct from text colors when composing shared controls.
const twMerge = extendTailwindMerge({ extend: { theme: { text: ["page", "section", "card", "body", "support", "ui", "nav", "label"] } } });
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }
