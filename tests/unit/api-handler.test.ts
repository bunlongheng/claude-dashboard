import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { withErrorHandler } from "@/lib/api-handler";

describe("withErrorHandler", () => {
  const req = new Request("http://localhost/api/x");

  it("passes the request and context through and returns the handler's response", async () => {
    const wrapped = withErrorHandler<Request, { id: number }>(async (r, ctx) =>
      NextResponse.json({ url: r.url, id: ctx.id }));
    const res = await wrapped(req, { id: 7 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "http://localhost/api/x", id: 7 });
  });

  it("turns a thrown Error into a 500 with its message", async () => {
    const wrapped = withErrorHandler(async () => { throw new Error("db offline"); });
    const res = await wrapped(req, undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "db offline" });
  });

  it("turns a non-Error throw into a generic 500", async () => {
    const wrapped = withErrorHandler(() => { throw "boom"; });
    const res = await wrapped(req, undefined);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal error" });
  });
});
