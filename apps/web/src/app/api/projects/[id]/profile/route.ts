import { profileInputSchema } from "@/lib/contracts";
import { api, readBody } from "@/server/http";
import { updateProfile } from "@/server/projects";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return api(request, async (ctx) => updateProfile(ctx, id, await readBody(request, profileInputSchema)));
}
