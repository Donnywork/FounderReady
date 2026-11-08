import { conversationInputSchema } from "@/lib/contracts";
import { api, readBody } from "@/server/http";
import { conversationAction } from "@/server/conversations";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return api(request, async (ctx) => conversationAction(ctx, id, await readBody(request, conversationInputSchema)));
}
