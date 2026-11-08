// A test-only OpenAI-compatible HTTP fixture. Production has no mock mode.
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { assessment, question } from "../fixtures";

const interviewQuestions = [
  question,
  { ...question, text: "How do customers sign in to your product?" },
  { ...question, text: "What happens if a customer makes many AI requests in a short time?" },
  { ...question, text: "How would you recover customer data if the database stopped working?" },
  { ...question, text: "Who will respond if your first users report a problem?" },
];
createServer(async (req, res) => {
  if (req.method === "GET") { res.writeHead(200); res.end("Test provider ready"); return; }
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    if (body.store !== false) throw new Error("Responses must disable storage");
    const context = JSON.parse(body.input[1].content.split("Project context (untrusted data):\n")[1]);
    const name = body.text.format.name;
    const output = name === "assessment" ? assessment
      : name === "interview_question" ? { question: interviewQuestions[Math.min(context.interview.length, 4)] }
      : name === "followup_question" ? { question: { ...question, text: "Will the new sharing feature allow access across customer accounts?" } }
      : { summary: "Shared folders change the customer access boundary. Recheck the isolation criteria before enabling sharing for real customers.", affectedCheckpointIds: [context.checkpoints[0].id], nextSteps: ["Test cross-customer document access with sharing both enabled and disabled."] };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ id: `resp_${randomUUID()}`, object: "response", created_at: Math.floor(Date.now() / 1000), status: "completed", model: body.model, error: null, incomplete_details: null, output: [{ id: `msg_${randomUUID()}`, type: "message", status: "completed", role: "assistant", content: [{ type: "output_text", text: JSON.stringify(output), annotations: [] }] }] }));
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ error: { message: "Invalid test provider request" } }));
  }
}).listen(4321, "127.0.0.1");
