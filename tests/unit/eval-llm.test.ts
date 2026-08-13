import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Anthropic SDK so no API key or network call is ever needed.
// vi.hoisted lets the mock factory below reference this fn (vi.mock calls
// are hoisted above imports by vitest).
const { mockCreate } = vi.hoisted(() => ({ mockCreate: vi.fn() }));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockCreate };
  },
}));

import { answer, judge, kpSynthesize } from "@/lib/eval/llm";

function textResult(text: string, tokensIn = 10, tokensOut = 5) {
  return {
    content: [{ type: "text", text }],
    usage: { input_tokens: tokensIn, output_tokens: tokensOut },
  };
}

describe("lib/eval/llm", () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  describe("answer", () => {
    it("builds a Context-prefixed prompt when context is non-empty", async () => {
      mockCreate.mockResolvedValueOnce(textResult("the answer"));
      const result = await answer("What is it?", "some context");
      expect(mockCreate).toHaveBeenCalledTimes(1);
      const call = mockCreate.mock.calls[0][0];
      expect(call.messages[0].content).toBe("Context:\nsome context\n\nQuestion: What is it?");
      expect(result.text).toBe("the answer");
      expect(result.usage.tokensIn).toBe(10);
      expect(result.usage.tokensOut).toBe(5);
      expect(result.usage.costUsd).toBeGreaterThan(0);
      expect(typeof result.usage.latencyMs).toBe("number");
    });

    it("omits the Context block when context is empty", async () => {
      mockCreate.mockResolvedValueOnce(textResult("plain answer"));
      const result = await answer("What is it?", "");
      const call = mockCreate.mock.calls[0][0];
      expect(call.messages[0].content).toBe("Question: What is it?");
      expect(result.text).toBe("plain answer");
    });

    it("omits the Context block when context is only whitespace", async () => {
      mockCreate.mockResolvedValueOnce(textResult("plain answer"));
      await answer("What is it?", "   \n  ");
      const call = mockCreate.mock.calls[0][0];
      expect(call.messages[0].content).toBe("Question: What is it?");
    });

    it("falls back to an empty string when no text block is present", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "image" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
      const result = await answer("q", "");
      expect(result.text).toBe("");
    });
  });

  describe("judge", () => {
    it("parses a clean JSON response", async () => {
      mockCreate.mockResolvedValueOnce(textResult('{"score":4,"reason":"good"}'));
      const result = await judge("q", "expected", "response");
      expect(result.score).toBe(4);
      expect(result.reason).toBe("good");
    });

    it("extracts JSON embedded in surrounding prose", async () => {
      mockCreate.mockResolvedValueOnce(
        textResult('Sure, here you go: {"score":3,"reason":"ok"} thanks!')
      );
      const result = await judge("q", "expected", "response");
      expect(result.score).toBe(3);
      expect(result.reason).toBe("ok");
    });

    it("defaults to score 0 and an unparseable-output reason when no braces are found", async () => {
      mockCreate.mockResolvedValueOnce(textResult("no json here at all"));
      const result = await judge("q", "expected", "response");
      expect(result.score).toBe(0);
      expect(result.reason).toBe("unparseable judge output");
    });

    it("keeps the defaults when the matched braces fail to parse", async () => {
      mockCreate.mockResolvedValueOnce(textResult("{bad}"));
      const result = await judge("q", "expected", "response");
      expect(result.score).toBe(0);
      expect(result.reason).toBe("unparseable judge output");
    });

    it("coerces a falsy/missing score to 0", async () => {
      mockCreate.mockResolvedValueOnce(textResult('{"score":0,"reason":"wrong"}'));
      const result = await judge("q", "expected", "response");
      expect(result.score).toBe(0);
      expect(result.reason).toBe("wrong");
    });

    it("defaults reason to an empty string when missing", async () => {
      mockCreate.mockResolvedValueOnce(textResult('{"score":2}'));
      const result = await judge("q", "expected", "response");
      expect(result.score).toBe(2);
      expect(result.reason).toBe("");
    });

    it("falls back to '{}' when no text block is present, yielding score 0 / empty reason", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
      const result = await judge("q", "expected", "response");
      expect(result.score).toBe(0);
      expect(result.reason).toBe("");
    });
  });

  describe("kpSynthesize", () => {
    it("returns an empty brief immediately when raw is empty, without calling the model", async () => {
      const result = await kpSynthesize("q", "");
      expect(mockCreate).not.toHaveBeenCalled();
      expect(result.brief).toBe("");
      expect(result.usage.tokensIn).toBe(0);
      expect(result.usage.tokensOut).toBe(0);
      expect(result.usage.costUsd).toBe(0);
      expect(result.usage.latencyMs).toBe(0);
    });

    it("returns an empty brief immediately when raw is only whitespace", async () => {
      const result = await kpSynthesize("q", "   ");
      expect(mockCreate).not.toHaveBeenCalled();
      expect(result.brief).toBe("");
    });

    it("synthesizes a brief when raw content is present", async () => {
      mockCreate.mockResolvedValueOnce(textResult("a tight brief"));
      const result = await kpSynthesize("q", "some raw memory");
      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(result.brief).toBe("a tight brief");
      expect(result.usage.tokensIn).toBe(10);
      expect(result.usage.tokensOut).toBe(5);
    });

    it("falls back to an empty string when no text block is present", async () => {
      mockCreate.mockResolvedValueOnce({
        content: [{ type: "image" }],
        usage: { input_tokens: 1, output_tokens: 1 },
      });
      const result = await kpSynthesize("q", "raw");
      expect(result.brief).toBe("");
    });
  });

  describe("cost() unknown-model fallback", () => {
    it("prices an unrecognized EVAL_ANSWER_MODEL at zero", async () => {
      vi.resetModules();
      const prevAnswer = process.env.EVAL_ANSWER_MODEL;
      process.env.EVAL_ANSWER_MODEL = "claude-totally-unknown-model";
      try {
        const freshLlm = await import("@/lib/eval/llm");
        mockCreate.mockResolvedValueOnce(textResult("hi", 100, 50));
        const result = await freshLlm.answer("q", "");
        expect(result.usage.model).toBe("claude-totally-unknown-model");
        expect(result.usage.costUsd).toBe(0);
      } finally {
        if (prevAnswer === undefined) delete process.env.EVAL_ANSWER_MODEL;
        else process.env.EVAL_ANSWER_MODEL = prevAnswer;
        vi.resetModules();
      }
    });
  });
});
