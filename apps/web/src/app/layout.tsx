import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "FounderReady — From working demo to first users", description: "Find the engineering risks behind your working demo. Get a practical, prioritized plan for your first real users." };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body className="min-h-screen antialiased"><a href="#main" className="sr-only fixed top-2 left-2 z-50 rounded bg-primary p-3 text-white focus:not-sr-only">Skip to content</a>{children}</body></html>;
}
