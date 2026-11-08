type InterviewContext = { description: string; interview: { topic?: string; question: string; answer: string; disposition: string }[] };

// Product-specific coverage anchors prevent an unknown answer from consuming the
// entire interview. The model still chooses wording, optional choices and whether
// enough context exists to finish. This is not a questionnaire across all domains.
export function interviewFocus(context: InterviewContext) {
  const product = context.description.toLowerCase();
  const aiProduct = /\b(ai|llm|openai|chatbot|agent|model api|anthropic)\b/.test(product);
  const payments = /\b(stripe|payments?|subscriptions?|checkout)\b/.test(product);
  const topics = aiProduct ? ["users-data", "ai-permissions", "api-costs"] : payments ? ["payments", "users-data", "failure-impact"] : ["users-data", "failure-impact"];
  const exploredTopics = context.interview.map((r) => r.topic).filter(Boolean);
  return { focusTopic: topics.find((topic) => !exploredTopics.includes(topic)) ?? null, exploredTopics };
}
