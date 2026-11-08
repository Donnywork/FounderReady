import { updateCheckpointSchema } from "@/lib/contracts";
import { api, readBody } from "@/server/http";
import { updateCheckpoint } from "@/server/projects";
export const runtime = "nodejs";
export async function PATCH(request: Request, context: { params: Promise<{ id: string; checkpointId: string }> }) {
  const { id, checkpointId } = await context.params;
  return api(request, async (ctx) => updateCheckpoint(ctx, id, checkpointId, await readBody(request, updateCheckpointSchema)));
}
