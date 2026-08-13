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
