import Anthropic from "@anthropic-ai/sdk";

// Per-million-token USD pricing. Adjust if Anthropic pricing changes.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5-20251001": { in: 1.0, out: 5.0 },
  "claude-sonnet-4-6": { in: 3.0, out: 15.0 },
};

const ANSWER_MODEL = process.env.EVAL_ANSWER_MODEL || "claude-haiku-4-5-20251001";
const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || "claude-haiku-4-5-20251001";

export type Usage = {
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
  latencyMs: number;
};

function cost(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICING[model] || { in: 0, out: 0 };
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

const ANSWER_SYSTEM = `You are answering questions about a developer's projects, setup, and preferences.
Answer ONLY from the context provided below. If the context does not contain the answer, say "I don't know - not in my context."
Be concise and specific. Do not invent details.`;

export async function answer(question: string, context: string): Promise<{ text: string; usage: Usage }> {
  const start = Date.now();
  const user = context.trim()
    ? `Context:\n${context}\n\nQuestion: ${question}`
    : `Question: ${question}`;
  const msg = await anthropic().messages.create({
    model: ANSWER_MODEL,
    max_tokens: 512,
    system: ANSWER_SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  const text = msg.content.find(b => b.type === "text")?.text ?? "";
  const tokensIn = msg.usage.input_tokens;
  const tokensOut = msg.usage.output_tokens;
  return {
    text,
    usage: {
      model: ANSWER_MODEL,
      tokensIn,
      tokensOut,
      costUsd: cost(ANSWER_MODEL, tokensIn, tokensOut),
      latencyMs: Date.now() - start,
    },
  };
}

const JUDGE_SYSTEM = `You grade an answer against a known-correct reference.
Score 0-5 on accuracy and groundedness:
- 5: fully correct, matches the reference
- 3: partially correct or incomplete
- 1: mostly wrong or vague
- 0: wrong, or "I don't know" when the reference has a clear answer
Return ONLY JSON: {"score": <0-5>, "reason": "<one sentence>"}`;

export async function judge(
  question: string,
  expected: string,
  response: string
): Promise<{ score: number; reason: string; usage: Usage }> {
  const start = Date.now();
  const msg = await anthropic().messages.create({
    model: JUDGE_MODEL,
    max_tokens: 256,
    system: JUDGE_SYSTEM,
    messages: [{
      role: "user",
      content: `Question: ${question}\n\nReference answer: ${expected}\n\nAnswer to grade: ${response}`,
    }],
  });
  const text = msg.content.find(b => b.type === "text")?.text ?? "{}";
  const match = text.match(/\{[\s\S]*\}/);
  let score = 0, reason = "unparseable judge output";
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      score = Number(parsed.score) || 0;
      reason = String(parsed.reason || "");
    } catch { /* keep defaults */ }
  }
  const tokensIn = msg.usage.input_tokens;
  const tokensOut = msg.usage.output_tokens;
  return {
    score,
    reason,
    usage: {
      model: JUDGE_MODEL,
      tokensIn,
      tokensOut,
      costUsd: cost(JUDGE_MODEL, tokensIn, tokensOut),
      latencyMs: Date.now() - start,
    },
  };
}

// KP synthesis: compile retrieved chunks / wiki into a tight brief.
const KP_SYSTEM = `You compile raw memory snippets into a single tight brief for answering a question.
Merge overlapping facts, drop irrelevant ones, resolve contradictions (prefer the most specific/recent).
Output a short factual brief (no preamble, no headings). This is Karpathy-style synthesis: distill, don't list.`;

export async function kpSynthesize(question: string, raw: string): Promise<{ brief: string; usage: Usage }> {
  const start = Date.now();
  if (!raw.trim()) {
    return { brief: "", usage: { model: ANSWER_MODEL, tokensIn: 0, tokensOut: 0, costUsd: 0, latencyMs: 0 } };
  }
  const msg = await anthropic().messages.create({
    model: ANSWER_MODEL,
    max_tokens: 512,
    system: KP_SYSTEM,
    messages: [{ role: "user", content: `Question: ${question}\n\nRaw memory:\n${raw}` }],
  });
  const brief = msg.content.find(b => b.type === "text")?.text ?? "";
  const tokensIn = msg.usage.input_tokens;
  const tokensOut = msg.usage.output_tokens;
  return {
    brief,
    usage: {
      model: ANSWER_MODEL,
      tokensIn,
      tokensOut,
      costUsd: cost(ANSWER_MODEL, tokensIn, tokensOut),
      latencyMs: Date.now() - start,
    },
  };
}
