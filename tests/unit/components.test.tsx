import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import AppIcon from "@/app/(claude)/_sections/AppIcon";
import {
  StatCard,
  SectionHeader,
  SegmentedTabs,
  MachineFilter,
  MACHINES,
} from "@/app/(claude)/_sections/shared";

afterEach(() => cleanup());

const StubIcon = (props: Record<string, unknown>) => <svg data-testid="icon" {...props} />;

describe("AppIcon", () => {
  it("renders the '?' fallback when no project is given", () => {
    render(<AppIcon project="" />);
    expect(screen.getByText("?")).toBeInTheDocument();
  });

  it("renders an <img> with the project as alt text", () => {
    render(<AppIcon project="claude" size={24} />);
    const img = screen.getByAltText("claude") as HTMLImageElement;
    expect(img.tagName).toBe("IMG");
    expect(img.getAttribute("width")).toBe("24");
  });

  it("points the image at the synced static icon path", () => {
    render(<AppIcon project="stickies" />);
    const img = screen.getByAltText("stickies");
    expect(img.getAttribute("src")).toBe("/app-icons/stickies.png");
  });

  it("falls through candidate URLs on image error, then shows the fallback once exhausted", () => {
    render(<AppIcon project="claude" />);
    let img = screen.getByAltText("claude") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/app-icons/claude.png");

    fireEvent.error(img);
    img = screen.getByAltText("claude") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/app-icons/claude.svg");

    fireEvent.error(img);
    img = screen.getByAltText("claude") as HTMLImageElement;
    expect(img.getAttribute("src")).toContain("/api/claude/project-icon");

    fireEvent.error(img);
    img = screen.getByAltText("claude") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/app-icons/claude-code.png");

    fireEvent.error(img);
    expect(screen.getByText("?")).toBeInTheDocument();
  });
});

describe("StatCard", () => {
  it("renders its label and value", () => {
    render(<StatCard label="Documents" value={42} />);
    expect(screen.getByText("Documents")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("renders the optional sub text", () => {
    render(<StatCard label="Docs" value={1} sub="last 7 days" />);
    expect(screen.getByText("last 7 days")).toBeInTheDocument();
  });

  it("fires onClick when pressed", () => {
    const onClick = vi.fn();
    render(<StatCard label="Tokens" value="1.2M" onClick={onClick} />);
    fireEvent.click(screen.getByText("Tokens"));
    expect(onClick).toHaveBeenCalledOnce();
  });
});

describe("SectionHeader", () => {
  it("renders the title text", () => {
    render(<SectionHeader icon={StubIcon} title="OVERVIEW" />);
    expect(screen.getByText("OVERVIEW")).toBeInTheDocument();
  });

  it("renders the provided icon", () => {
    render(<SectionHeader icon={StubIcon} title="RAG" />);
    expect(screen.getByTestId("icon")).toBeInTheDocument();
  });
});

describe("SegmentedTabs", () => {
  const tabs = [
    { key: "a", label: "Alpha" },
    { key: "b", label: "Beta", count: 3 },
  ] as const;

  it("renders every tab label", () => {
    render(<SegmentedTabs tabs={[...tabs]} value="a" onChange={() => {}} />);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });

  it("renders a count badge when provided", () => {
    render(<SegmentedTabs tabs={[...tabs]} value="a" onChange={() => {}} />);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls onChange with the clicked tab key", () => {
    const onChange = vi.fn();
    render(<SegmentedTabs tabs={[...tabs]} value="a" onChange={onChange} />);
    fireEvent.click(screen.getByText("Beta"));
    expect(onChange).toHaveBeenCalledWith("b");
  });
});

describe("MachineFilter", () => {
  afterEach(() => {
    MACHINES.length = 0;
  });

  it("always renders the 'All' pill", () => {
    render(<MachineFilter value={null} onChange={() => {}} />);
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("calls onChange(null) when 'All' is clicked", () => {
    const onChange = vi.fn();
    render(<MachineFilter value={null} onChange={onChange} />);
    fireEvent.click(screen.getByText("All"));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("renders a pill for each machine in MACHINES", () => {
    MACHINES.push("mac-mini");
    render(<MachineFilter value="mac-mini" onChange={() => {}} />);
    expect(screen.getByText("mac-mini")).toBeInTheDocument();
  });
});

// ─── Churn hotspots: JevCard, JevCharts, ClaudeSidebarNav ───────────────────
// These 3 are the most-edited UI files and were covered only by E2E label
// checks. Rendered here against MSW stubs of the exact endpoints they fetch.
// apiBase is pinned to an absolute origin because Node's fetch (which jsdom
// does not replace) rejects relative URLs before MSW ever sees them.

import { waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http, HttpResponse } from "msw";
import { server } from "../msw/server";
import { JevCard } from "@/app/(claude)/_sections/overview/JevCard";
import JevCharts from "@/app/(claude)/_sections/JevCharts";
import ClaudeSidebarNav, { NAV_ITEMS } from "@/app/(claude)/_sections/ClaudeSidebarNav";
import type { JevPayload } from "@/lib/jev-log";

const API = "http://localhost:3003";
const routerPush = vi.fn();
let pathname = "/dashboard";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: routerPush, replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/app/(claude)/_sections/MachineContext", () => ({
  useMachine: () => ({ machine: null, setMachine: () => {}, machines: [], machineColors: {}, apiBase: (p: string) => `${API}${p}` }),
  MachineProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// recharts' ResponsiveContainer measures its parent, which is 0x0 in jsdom, so
// hand the chart a fixed box and let the real series render.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) => (
      <div data-testid="chart">{React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { width: 800, height: 200 })}</div>
    ),
  };
});

const today = new Date().toLocaleDateString("en-CA");
const JEV_FIXTURE: JevPayload = {
  totals: { calls: 12, routed: 9, skipped: 2, errors: 1, routedPct: 75, avgLatencyMs: 412.4, p95LatencyMs: 900, inputTokens: 5000, outputTokens: 1200, estCostUsd: 0.0312, sessions: 2, lastCallTs: new Date().toISOString(), lastRoutedTs: new Date().toISOString() },
  health: "live",
  daily: [
    { day: today, routed: 5, skipped: 1, errors: 1, avgLatencyMs: 400, p95LatencyMs: 900, tokens: 3200 },
    { day: "2026-09-20", routed: 4, skipped: 1, errors: 0, avgLatencyMs: 420, p95LatencyMs: 800, tokens: 3000 },
  ],
  hourly: [{ hour: `${today}T14`, label: "14:00", routed: 5, skipped: 1, errors: 1, avgLatencyMs: 400, tokens: 3200 }],
  tiers: { haiku: 4, sonnet: 3, opus: 2, fable: 0 },
  sessions: [
    { session_id: "sess-aaaa-1111", project: "claude", messages: 7, routed: 5, skipped: 1, errors: 1, topTier: "sonnet", firstTs: new Date().toISOString(), lastTs: new Date().toISOString(), avgConf: 0.91 },
    { session_id: "sess-bbbb-2222", project: "bheng", messages: 5, routed: 4, skipped: 1, errors: 0, topTier: "haiku", firstTs: new Date().toISOString(), lastTs: new Date().toISOString(), avgConf: 0.8 },
  ],
  recent: [],
  days: 7, project: null, projects: ["bheng", "claude"], logPath: "/tmp/jev.jsonl", hookPath: "/tmp/jev-router.sh",
};

function withQuery(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("JevCard", () => {
  it("fetches /api/claude/jev?days=7 and shows the 3 headline stats", async () => {
    let seenUrl = "";
    server.use(http.get(`${API}/api/claude/jev`, ({ request }) => { seenUrl = request.url; return HttpResponse.json(JEV_FIXTURE); }));
    withQuery(<JevCard />);
    expect(await screen.findByText("LIVE")).toBeInTheDocument();
    expect(seenUrl).toBe(`${API}/api/claude/jev?days=7`);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("412")).toBeInTheDocument();
    expect(screen.getByText("$0.03")).toBeInTheDocument();
    expect(screen.getByText(/7d · 9/)).toBeInTheDocument();
    expect(screen.getByText("LIVE").closest("a")).toHaveAttribute("href", "/jev");
  });

  it("keeps extra precision on a sub-cent cost", async () => {
    server.use(http.get(`${API}/api/claude/jev`, () => HttpResponse.json({ ...JEV_FIXTURE, totals: { ...JEV_FIXTURE.totals, estCostUsd: 0.0042 } })));
    withQuery(<JevCard />);
    expect(await screen.findByText("$0.0042")).toBeInTheDocument();
  });

  it("shows the empty state with NEVER when the API fails", async () => {
    server.use(http.get(`${API}/api/claude/jev`, () => HttpResponse.json({ error: "boom" }, { status: 500 })));
    withQuery(<JevCard />);
    expect(await screen.findByText("No routed prompts in the last 7 days.")).toBeInTheDocument();
    expect(screen.getByText("NEVER")).toBeInTheDocument();
    expect(screen.queryByText("75%")).not.toBeInTheDocument();
  });
});

describe("JevCharts", () => {
  it("renders the health strip numbers from the aggregate", () => {
    render(<JevCharts data={JEV_FIXTURE} />);
    expect(screen.getByText("LIVE")).toBeInTheDocument();
    // 5 routed + 1 skipped + 1 error today, 12 in the range
    const callsTile = screen.getByText("Calls today").closest("div")!.parentElement!;
    expect(callsTile).toHaveTextContent("7");
    expect(callsTile).toHaveTextContent("12 in range");
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("412.4ms")).toBeInTheDocument();
    expect(screen.getByText("p95 900ms")).toBeInTheDocument();
    expect(screen.getByText("3.2k")).toBeInTheDocument();
    expect(screen.getByText("2 sessions")).toBeInTheDocument();
    expect(screen.getByText("check the log")).toBeInTheDocument();
  });

  it("draws the 3 stacked call series and 2 latency lines", () => {
    const { container } = render(<JevCharts data={JEV_FIXTURE} />);
    expect(screen.getAllByTestId("chart").length).toBeGreaterThanOrEqual(3);
    expect(container.querySelectorAll(".recharts-bar").length).toBe(3);
    expect(container.querySelectorAll(".recharts-line").length).toBeGreaterThanOrEqual(2);
    expect(container.querySelectorAll(".recharts-pie").length).toBe(1);
  });

  it("lists every session with its project", () => {
    render(<JevCharts data={JEV_FIXTURE} />);
    expect(screen.getByText("sess-aaa").closest("a")).toHaveAttribute("href", "/sess-aaaa-1111");
    expect(screen.getByText("sess-bbb").closest("a")).toHaveAttribute("href", "/sess-bbbb-2222");
    expect(screen.getByAltText("claude")).toBeInTheDocument();
  });

  it("shows the never-ran setup block instead of charts when there is no log", () => {
    const { container } = render(<JevCharts data={{ ...JEV_FIXTURE, health: "never", totals: { ...JEV_FIXTURE.totals, calls: 0, lastCallTs: null } }} />);
    expect(screen.getByText("NEVER")).toBeInTheDocument();
    expect(screen.getByText(/jev\.jsonl/)).toBeInTheDocument();
    expect(container.querySelectorAll(".recharts-bar").length).toBe(0);
  });
});

describe("ClaudeSidebarNav", () => {
  const badgeStubs = () => server.use(
    http.get(`${API}/api/claude/sessions`, () => HttpResponse.json({ projects: [{ sessions: [{}, {}] }, { sessions: [{}] }] })),
    http.get(`${API}/api/claude/skills`, () => HttpResponse.json({ summary: { skills: 42, mcp: 6, claudeMd: 3, hooks: 1, commands: 2, plugins: 3, settings: 5 } })),
    http.get(`${API}/api/claude/brain`, () => HttpResponse.json({ totalProjects: 11 })),
    http.get(`${API}/api/claude/token-stats/daily`, () => HttpResponse.json({ daily: [{ input: 900_000, output: 300_000 }] })),
    http.get(`${API}/api/rag/stats`, () => HttpResponse.json({ documents: 8 })),
    http.get(`${API}/api/claude/jev`, () => HttpResponse.json({ daily: [{ day: today, routed: 3, skipped: 1, errors: 0 }] })),
  );

  it("renders every nav link with its href and marks the current one active", async () => {
    pathname = "/sessions";
    badgeStubs();
    withQuery(<ClaudeSidebarNav />);
    const aside = screen.getAllByRole("complementary")[0];
    for (const item of NAV_ITEMS) {
      const link = within(aside).getByRole("link", { name: new RegExp(`^${item.label}`) });
      expect(link, item.label).toHaveAttribute("href", item.href);
    }
    const active = within(aside).getByRole("link", { name: /^Sessions/ });
    expect(active.style.fontWeight).toBe("600");
    expect(within(aside).getByRole("link", { name: /^Skills/ }).style.fontWeight).toBe("400");
    await waitFor(() => expect(active).toHaveTextContent("3"));
  });

  it("fills the badges from the 6 endpoints", async () => {
    pathname = "/dashboard";
    badgeStubs();
    withQuery(<ClaudeSidebarNav />);
    const aside = screen.getAllByRole("complementary")[0];
    await waitFor(() => expect(within(aside).getByRole("link", { name: /^Skills/ })).toHaveTextContent("42"));
    expect(within(aside).getByRole("link", { name: /^Sessions/ })).toHaveTextContent("3");
    expect(within(aside).getByRole("link", { name: /^Extensions/ })).toHaveTextContent("6");
    expect(within(aside).getByRole("link", { name: /^Tokens/ })).toHaveTextContent("1.2M");
    expect(within(aside).getByRole("link", { name: /^Overview/ })).toHaveTextContent("11");
    expect(within(aside).getByRole("link", { name: /^Jev/ })).toHaveTextContent("4");
  });

  it("cycles collapse levels: badges hidden at 1, labels gone at 2, back to full", async () => {
    pathname = "/dashboard";
    badgeStubs();
    withQuery(<ClaudeSidebarNav />);
    const aside = screen.getAllByRole("complementary")[0];
    await waitFor(() => expect(within(aside).getByRole("link", { name: /^Skills/ })).toHaveTextContent("42"));

    fireEvent.click(within(aside).getByTitle("Hide badges"));
    expect(within(aside).getByRole("link", { name: /^Skills/ })).not.toHaveTextContent("42");
    expect(within(aside).getByText("Skills")).toBeInTheDocument();

    fireEvent.click(within(aside).getByTitle("Icon only"));
    expect(within(aside).queryByText("Skills")).not.toBeInTheDocument();
    expect(within(aside).getByRole("link", { name: /^Skills/ })).toHaveAttribute("href", "/skills");

    fireEvent.click(within(aside).getByTitle("Show all"));
    expect(within(aside).getByRole("link", { name: /^Skills/ })).toHaveTextContent("42");
  });
});
