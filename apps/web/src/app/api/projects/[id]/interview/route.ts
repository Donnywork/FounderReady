import { interviewActionSchema } from "@/lib/contracts";
import { api, readBody } from "@/server/http";
import { interview } from "@/server/projects";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return api(request, async (ctx) => interview(ctx, id, await readBody(request, interviewActionSchema)));
}
