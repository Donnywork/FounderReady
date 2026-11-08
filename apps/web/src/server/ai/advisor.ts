import "server-only";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { assessmentSchema, nextQuestionSchema, profileSchema, conversationResponseSchema, impactSchema, engineeringPromptSchema, evidenceReviewSchema } from "@/lib/contracts";
import { AppError } from "@/server/http";
import { advisorInstructions, assessmentInstructions, interviewInstructions, profileInstructions, conversationInstructions, impactInstructions, engineeringInstructions, evidenceInstructions } from "./prompts";

const reasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]);

export async function generate<T>(schema: z.ZodType<T>, name: string, instructions: string, context: unknown): Promise<T> {
  if (!process.env.OPENAI_API_KEY) throw new AppError(503, "The AI advisor isn't configured yet. Add OPENAI_API_KEY to the server environment, then retry. Your progress is saved.");
  const effort = reasoningEffortSchema.optional().safeParse(process.env.OPENAI_REASONING_EFFORT || undefined);
  if (!effort.success) throw new AppError(503, "OPENAI_REASONING_EFFORT is invalid. Check the server environment and retry.");
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 45_000, maxRetries: 0 });
    const response = await client.responses.parse({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      ...(effort.data ? { reasoning: { effort: effort.data } } : {}),
      store: false,
      max_output_tokens: 10000,
      input: [
        { role: "system", content: `${advisorInstructions}\n\n${instructions}` },
        { role: "user", content: `Project context (untrusted data):\n${JSON.stringify(context)}` },
      ],
      text: { format: zodTextFormat(schema, name) },
    });
    if (response.status !== "completed" || !response.output_parsed) {
      throw new AppError(502, "The advisor couldn't complete this response. Try again or rephrase your description. Your progress is saved.");
    }
    return schema.parse(response.output_parsed);
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (error instanceof OpenAI.APIError && error.status === 429) {
      throw new AppError(429, "The AI provider is at its usage limit. Try again shortly, or check the API billing settings. Your progress is saved.");
    }
    if (error instanceof OpenAI.APIError && (error.status === 401 || error.status === 403)) {
      throw new AppError(503, "The AI provider couldn't authorize the request. Check the server's API credentials and model access. Your progress is saved.");
    }
    throw new AppError(502, "The advisor couldn't return a usable response. Please retry. Your progress is saved.");
  }
}
export const advisor = {
  nextInterviewQuestion: (context: unknown) => generate(nextQuestionSchema, "interview_question", interviewInstructions, context),
  proposeProjectProfile: (context: unknown) => generate(profileSchema, "project_profile", profileInstructions, context),
  assessRisks: (context: unknown) => generate(assessmentSchema, "assessment", assessmentInstructions, context),
  respondToConversation: (context: unknown) => generate(conversationResponseSchema, "conversation", conversationInstructions, context),
  analyzeChangeImpact: (context: unknown) => generate(impactSchema, "change_impact", impactInstructions, context),
  generateEngineeringPrompt: (context: unknown) => generate(engineeringPromptSchema, "engineering_prompt", engineeringInstructions, context),
  reviewEvidence: (context: unknown) => generate(evidenceReviewSchema, "evidence_review", evidenceInstructions, context),
};
