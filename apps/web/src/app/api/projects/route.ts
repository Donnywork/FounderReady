import { NextResponse } from "next/server";
import { createProjectSchema } from "@/lib/contracts";
import { api, readBody, sessionToken } from "@/server/http";
import { createProject, listProjects } from "@/server/projects";
export const runtime = "nodejs";
export async function GET(request: Request) {
  if (!sessionToken(request)) return NextResponse.json({ projects: [] }, { headers: { "Cache-Control": "private, no-store" } });
  return api(request, listProjects);
}
export async function POST(request: Request) {
  return api(request, async (ctx) => {
    const input = await readBody(request, createProjectSchema);
    return createProject(ctx, input.description);
  }, true);
}
