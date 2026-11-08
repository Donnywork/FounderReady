# Build FounderReady — Full-Stack MVP

## Product Background

FounderReady is an AI-powered technical readiness advisor for nontechnical startup founders who have built a working demo using tools like Cursor, Lovable, or Codex and want to launch to their first real users.

The goal is to help founders:

1. Identify overlooked engineering risks.
2. Understand technical concepts in plain English.
3. Prioritize what needs to be addressed before launch.
4. Generate actionable prompts for engineering teams or coding agents.
5. Track progress through persistent, evidence-based checkpoints.

Focus on security, privacy, reliability, AI-specific risks, operational costs, and engineering readiness. Surface relevant legal/compliance concerns without providing legal advice.

**Out of scope:** PMF, business models, fundraising, code generation, and formal security certification.

Internally, use the Commitment–Preparedness–Discipline (CPD) framework to guide risk identification, ownership, verification, and continuous review. Do not expose CPD terminology in the UI.

## Tech Stack

- Next.js (latest version) App Router + TypeScript
- Tailwind CSS + shadcn/ui
- PostgreSQL running in Docker Compose
- Typeorm
- OpenAI API (official SDK, Responses API)
- Zod for validation
- pnpm + turborepo
- Nodejs 24.21.0

Use Next.js Route Handlers for the backend. Keep everything in one maintainable Next.js project.

## Core MVP Workflow

**1. Landing Page**

A clean, minimal interface inspired by shipitbot.com.

- Product name: FounderReady
- One clear value proposition
- Text input: "What are you building?"
- A few clickable examples: unexpected AI costs, website outages, prompt injection/data leaks
- No unnecessary badges, marketing clutter, or complex navigation

**2. Guided AI Interview**

After the founder describes their product:

- Ask up to 5 adaptive, context-aware questions.
- Display one question at a time.
- Allow "I don't know" and skipping.
- Explain unfamiliar concepts simply.
- Prioritize questions based on the product's architecture, users, data, and risks.
- Never fabricate technical facts about the user's implementation.

**3. Readiness Workspace**

After the interview, generate 3–5 prioritized checkpoints.

Each checkpoint includes:

- Risk and plain-English explanation
- Priority and reasoning
- Recommended action
- Clear acceptance criteria
- Copyable engineering prompt
- Owner, status, and supporting evidence
- Review triggers for future changes

Allow founders to update checkpoint status, attach textual evidence, and confirm completion manually. Clearly distinguish reported implementation from verified evidence.

**4. Persistent Dashboard**

- Overview of current readiness and outstanding risks
- Checkpoint management and progress tracking
- Copy-to-clipboard engineering prompts
- Ability to revisit risks and generate follow-up questions
- Conversation history accessible from the lower section of the left sidebar

## AI Implementation

Implement structured, validated OpenAI outputs for:

- Adaptive interview question generation
- Risk identification and prioritization
- Checkpoint generation
- Engineering prompt generation
- Follow-up assessment

Keep prompt templates organized and maintainable. Persist relevant conversation context in PostgreSQL.

The AI should guide founder decisions, not claim to perform security audits or verify code it hasn't inspected.

## Data & Security

Design appropriate PostgreSQL tables for projects, conversations, interview responses, checkpoints, and evidence.

For MVP, support persistent anonymous guest sessions without requiring authentication. Isolate each session's data.

Keep OpenAI credentials server-side using environment variables.

## Design Requirements

Extremely minimal, modern, spacious, and responsive. Prioritize readability and clear hierarchy. Avoid cluttered dashboards, unnecessary cards, badges, and decorative elements.

## Implementation Instructions

Build a **working end-to-end MVP**, not just static UI mockups.

1. Inspect the repository and scaffold the application if needed.
2. Set up PostgreSQL, Docker Compose, schema, and migrations.
3. Implement the full frontend and backend workflow.
4. Integrate real OpenAI API calls with error handling.
5. Add basic tests for core logic and API endpoints. Don't overtest.
6. Provide `.env.example`, detailed setup instructions, and a concise README.
7. Run lint, type checks, tests, and build; fix issues found.

Prioritize the complete happy path:

**Describe product → AI interview → Risk assessment → Checkpoints → Copy engineering prompt → Update progress → Revisit.**

Keep the architecture simple and extensible. Make reasonable implementation decisions independently, document assumptions, and deliver functional code.