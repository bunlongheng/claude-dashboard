import { describe, it, expect } from "vitest";
import { frameHeaders } from "@/lib/frame-ancestors";

describe("frameHeaders", () => {
    it("denies framing by default", () => {
        expect(frameHeaders("/dashboard", "")).toEqual({ csp: "'none'", xfo: "DENY" });
    });
    it("allows listed origins and drops X-Frame-Options", () => {
        expect(frameHeaders("/dashboard", "http://localhost:3212, http://127.0.0.1:3212")).toEqual({ csp: "'self' http://localhost:3212 http://127.0.0.1:3212", xfo: null });
    });
});
