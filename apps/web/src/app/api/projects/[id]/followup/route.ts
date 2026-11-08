import { followupActionSchema } from "@/lib/contracts";
import { api, readBody } from "@/server/http";
import { followup } from "@/server/projects";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return api(request, async (ctx) => followup(ctx, id, await readBody(request, followupActionSchema)));
}
