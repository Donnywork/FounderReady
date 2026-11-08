import { proposalDecisionSchema } from "@/lib/contracts";
import { api, readBody } from "@/server/http";
import { decideProposal } from "@/server/conversations";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string; proposalId: string }> }) {
  const { id, proposalId } = await context.params;
  return api(request, async (ctx) => decideProposal(ctx, id, proposalId, await readBody(request, proposalDecisionSchema)));
}
