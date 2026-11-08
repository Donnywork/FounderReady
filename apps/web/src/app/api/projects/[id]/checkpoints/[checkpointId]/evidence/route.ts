import { evidenceInputSchema } from "@/lib/contracts";
import { api, readBody } from "@/server/http";
import { addEvidence } from "@/server/projects";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string; checkpointId: string }> }) {
  const { id, checkpointId } = await context.params;
  return api(request, async (ctx) => addEvidence(ctx, id, checkpointId, await readBody(request, evidenceInputSchema)));
}
