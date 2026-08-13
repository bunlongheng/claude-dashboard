import { describe, it, expect, vi } from "vitest";

const { pipelineMock } = vi.hoisted(() => {
  const extractorMock = vi.fn(async (text: string | string[], _opts: { pooling: "mean"; normalize: boolean }) => {
    const list = Array.isArray(text) ? text : [text];
    const dim = 4;
    const data = new Float32Array(list.length * dim);
    list.forEach((t, i) => {
      for (let d = 0; d < dim; d++) {
        data[i * dim + d] = (t.length + d) / 10;
      }
    });
    return { data, dims: [list.length, dim] };
  });
  const pipelineMock = vi.fn(async () => extractorMock);
  return { extractorMock, pipelineMock };
});

vi.mock("@huggingface/transformers", () => ({
  pipeline: pipelineMock,
}));

import { embed, embedBatch, cosine, toBuffer, fromBuffer } from "@/lib/eval/embeddings";

describe("eval/embeddings", () => {
  it("embed returns a Float32Array from the extractor output", async () => {
    const v = await embed("hello world");
    expect(v).toBeInstanceOf(Float32Array);
    expect(v.length).toBe(4);
  });

  it("caches the extractor across multiple embed calls (pipeline constructed once)", async () => {
    await embed("second call");
    await embed("third call");
    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it("embedBatch embeds each text and returns one vector per input", async () => {
    const vectors = await embedBatch(["one", "two", "three"]);
    expect(vectors.length).toBe(3);
    vectors.forEach((v) => expect(v).toBeInstanceOf(Float32Array));
    expect(pipelineMock).toHaveBeenCalledTimes(1);
  });

  it("cosine computes the dot product of two equal-length vectors", () => {
    const a = new Float32Array([1, 2, 3]);
    const b = new Float32Array([4, 5, 6]);
    expect(cosine(a, b)).toBeCloseTo(1 * 4 + 2 * 5 + 3 * 6, 5);
  });

  it("cosine truncates to the shorter vector when lengths differ", () => {
    const a = new Float32Array([1, 2, 3, 4]);
    const b = new Float32Array([1, 1]);
    expect(cosine(a, b)).toBeCloseTo(1 * 1 + 2 * 1, 5);
  });

  it("toBuffer and fromBuffer round-trip a Float32Array", () => {
    const original = new Float32Array([0.5, -1.25, 3.75, 100.125]);
    const buf = toBuffer(original);
    expect(buf).toBeInstanceOf(Buffer);
    const restored = fromBuffer(buf);
    expect(Array.from(restored)).toEqual(Array.from(original));
  });
});
