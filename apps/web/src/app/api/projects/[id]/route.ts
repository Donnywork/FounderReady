import { api } from "@/server/http";
import { projectDetail } from "@/server/projects";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return api(request, (ctx) => projectDetail(ctx, id));
}
