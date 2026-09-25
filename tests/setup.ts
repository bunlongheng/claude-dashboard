import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw/server";

// ─── jsdom shims ──────────────────────────────────────────────────────────────
// Components and charts (recharts) expect these browser APIs that jsdom omits.
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
  if (!(window as any).ResizeObserver) {
    (window as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
  if (!window.scrollTo) {
    window.scrollTo = (() => {}) as any;
  }
}

// ─── MSW lifecycle ──────────────────────────────────────────────────────────────
// A request with no handler is a test bug, not a network call: fail it loudly
// instead of letting it reach the real network (peers, localhost:9876, etc).
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
