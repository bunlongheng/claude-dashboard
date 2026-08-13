import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server";
import {
  TAB_PALETTE,
  tabColor,
  calcCost,
  fmtCost,
  fmtNum,
  fmtCompact,
  hexToRgba,
  timeAgo,
  fmtTs,
  filterByInterval,
  groupBy,
  machineLabel,
  MACHINE_META,
  safeFetch,
  type Token,
  type HistoryEntry,
} from "@/app/(claude)/_sections/shared";

function makeToken(over: Partial<Token> = {}): Token {
  return {
    session_id: "s1",
    input_tokens: 0,
    output_tokens: 0,
    cache_read_tokens: 0,
    cache_creation_tokens: 0,
    prompt_count: 0,
    ...over,
  };
}

describe("tabColor", () => {
  it("returns a color from the palette", () => {
    expect(TAB_PALETTE).toContain(tabColor("abc123"));
  });

  it("is deterministic for the same input", () => {
    expect(tabColor("session-xyz")).toBe(tabColor("session-xyz"));
  });

  it("returns a value for an empty string", () => {
    expect(TAB_PALETTE).toContain(tabColor(""));
  });

  it("maps different inputs to palette members", () => {
    expect(TAB_PALETTE).toContain(tabColor("another-session"));
  });
});

describe("calcCost", () => {
  it("prices 1M opus input tokens at $15", () => {
    expect(calcCost(makeToken({ model: "claude-opus-4", input_tokens: 1_000_000 }))).toBeCloseTo(15);
  });

  it("defaults to sonnet pricing when model is missing", () => {
    expect(calcCost(makeToken({ input_tokens: 1_000_000 }))).toBeCloseTo(3);
  });

  it("uses haiku pricing for a haiku model", () => {
    expect(calcCost(makeToken({ model: "claude-haiku-4-5", input_tokens: 1_000_000 }))).toBeCloseTo(1);
  });

  it("includes cache read and creation token costs", () => {
    const cost = calcCost(makeToken({ model: "sonnet", cache_read_tokens: 1_000_000, cache_creation_tokens: 1_000_000 }));
    expect(cost).toBeCloseTo(0.3 + 3.75);
  });

  it("returns 0 for an all-zero token row", () => {
    expect(calcCost(makeToken())).toBe(0);
  });
});

describe("fmtCost", () => {
  it("renders tiny amounts as <$0.01", () => {
    expect(fmtCost(0.003)).toBe("<$0.01");
  });

  it("renders zero as <$0.01", () => {
    expect(fmtCost(0)).toBe("<$0.01");
  });

  it("renders exactly one cent as $0.01", () => {
    expect(fmtCost(0.01)).toBe("$0.01");
  });

  it("renders dollars with two decimals", () => {
    expect(fmtCost(1.5)).toBe("$1.50");
  });

  it("renders large amounts", () => {
    expect(fmtCost(123.456)).toBe("$123.46");
  });
});

describe("fmtNum", () => {
  it("formats billions", () => {
    expect(fmtNum(1_500_000_000)).toBe("1.5B");
  });
  it("formats millions", () => {
    expect(fmtNum(1_500_000)).toBe("1.5M");
  });
  it("formats thousands", () => {
    expect(fmtNum(12_345)).toBe("12.3k");
  });
  it("formats exactly one thousand", () => {
    expect(fmtNum(1000)).toBe("1.0k");
  });
  it("returns the raw number under 1000", () => {
    expect(fmtNum(999)).toBe("999");
  });
  it("returns 0 unchanged", () => {
    expect(fmtNum(0)).toBe("0");
  });
});

describe("fmtCompact", () => {
  it("formats billions", () => {
    expect(fmtCompact(1_500_000_000)).toBe("1.5B");
  });
  it("formats millions", () => {
    expect(fmtCompact(1_200_000)).toBe("1.2M");
  });
  it("rounds thousands to a whole K", () => {
    expect(fmtCompact(930_000)).toBe("930K");
  });
  it("rounds 1500 up to 2K", () => {
    expect(fmtCompact(1500)).toBe("2K");
  });
  it("formats exactly one thousand as 1K", () => {
    expect(fmtCompact(1000)).toBe("1K");
  });
  it("returns the raw number under 1000", () => {
    expect(fmtCompact(999)).toBe("999");
  });
});

describe("hexToRgba", () => {
  it("converts the brand orange", () => {
    expect(hexToRgba("#f97316", 0.2)).toBe("rgba(249,115,22,0.2)");
  });
  it("converts white at full opacity", () => {
    expect(hexToRgba("#ffffff", 1)).toBe("rgba(255,255,255,1)");
  });
  it("converts black", () => {
    expect(hexToRgba("#000000", 0.5)).toBe("rgba(0,0,0,0.5)");
  });
  it("tolerates a hex string without the leading #", () => {
    expect(hexToRgba("f97316", 0.2)).toBe("rgba(249,115,22,0.2)");
  });
});

describe("time helpers", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("timeAgo renders seconds", () => {
    expect(timeAgo(Date.now() - 5000)).toBe("5s ago");
  });
  it("timeAgo renders just-now as 0s ago", () => {
    expect(timeAgo(Date.now())).toBe("0s ago");
  });
  it("timeAgo renders minutes", () => {
    expect(timeAgo(Date.now() - 120_000)).toBe("2m ago");
  });
  it("timeAgo renders hours", () => {
    expect(timeAgo(Date.now() - 7_200_000)).toBe("2h ago");
  });
  it("timeAgo renders days", () => {
    expect(timeAgo(Date.now() - 2 * 86_400_000)).toBe("2d ago");
  });

  it("fmtTs returns a non-empty string containing a digit", () => {
    const out = fmtTs(Date.now());
    expect(out.length).toBeGreaterThan(0);
    expect(out).toMatch(/\d/);
  });
  it("fmtTs renders a 12-hour AM/PM clock", () => {
    expect(fmtTs(Date.now())).toMatch(/AM|PM/);
  });
});

describe("filterByInterval", () => {
  let entries: HistoryEntry[];
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-24T12:00:00Z"));
    const now = Date.now();
    entries = [
      { display: "now", timestamp: now },
      { display: "6 days ago", timestamp: now - 6 * 86_400_000 },
      { display: "20 days ago", timestamp: now - 20 * 86_400_000 },
      { display: "100 days ago", timestamp: now - 100 * 86_400_000 },
    ];
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("'all' returns every entry", () => {
    expect(filterByInterval(entries, "all")).toHaveLength(4);
  });
  it("'7d' drops entries older than a week", () => {
    expect(filterByInterval(entries, "7d")).toHaveLength(2);
  });
  it("'1m' keeps the last 30 days", () => {
    expect(filterByInterval(entries, "1m")).toHaveLength(3);
  });
  it("'today' keeps only entries from today", () => {
    expect(filterByInterval(entries, "today")).toHaveLength(1);
  });
});

describe("groupBy", () => {
  it("groups items by the key function", () => {
    const grouped = groupBy([{ t: "a" }, { t: "b" }, { t: "a" }], (x) => x.t);
    expect(grouped.get("a")).toHaveLength(2);
    expect(grouped.get("b")).toHaveLength(1);
  });
  it("returns an empty map for an empty array", () => {
    expect(groupBy([], () => "k").size).toBe(0);
  });
});

describe("machineLabel", () => {
  const keys = ["__t_host", "__t_unknown", "__t_emptyhost", "__t_nohostip"];
  afterEach(() => {
    for (const k of keys) delete MACHINE_META[k];
  });

  it("returns the key when there is no metadata", () => {
    expect(machineLabel("__t_absent")).toBe("__t_absent");
  });
  it("prefers a real hostname", () => {
    MACHINE_META["__t_host"] = { hostname: "MyMac" };
    expect(machineLabel("__t_host")).toBe("MyMac");
  });
  it("falls back to ip when hostname is 'Unknown'", () => {
    MACHINE_META["__t_unknown"] = { hostname: "Unknown", ip: "1.2.3.4" };
    expect(machineLabel("__t_unknown")).toBe("1.2.3.4");
  });
  it("falls back to ip when hostname is empty", () => {
    MACHINE_META["__t_emptyhost"] = { hostname: "", ip: "5.6.7.8" };
    expect(machineLabel("__t_emptyhost")).toBe("5.6.7.8");
  });
  it("returns the key when hostname is Unknown and there is no ip", () => {
    MACHINE_META["__t_nohostip"] = { hostname: "Unknown" };
    expect(machineLabel("__t_nohostip")).toBe("__t_nohostip");
  });
});

describe("safeFetch (mocked with MSW)", () => {
  it("returns parsed JSON on a successful response", async () => {
    server.use(http.get("https://api.test/ok", () => HttpResponse.json({ a: 1 })));
    expect(await safeFetch("https://api.test/ok", { a: 0 })).toEqual({ a: 1 });
  });

  it("returns the fallback on a non-ok response", async () => {
    server.use(http.get("https://api.test/bad", () => new HttpResponse(null, { status: 500 })));
    expect(await safeFetch("https://api.test/bad", { a: 99 })).toEqual({ a: 99 });
  });

  it("returns the fallback when the request errors", async () => {
    server.use(http.get("https://api.test/boom", () => HttpResponse.error()));
    expect(await safeFetch("https://api.test/boom", { fallback: true })).toEqual({ fallback: true });
  });

  it("still fetches when AbortSignal.timeout is unavailable", async () => {
    const original = (AbortSignal as any).timeout;
    delete (AbortSignal as any).timeout;
    server.use(http.get("https://api.test/no-timeout", () => HttpResponse.json({ ok: true })));
    expect(await safeFetch("https://api.test/no-timeout", { ok: false })).toEqual({ ok: true });
    (AbortSignal as any).timeout = original;
  });
});
