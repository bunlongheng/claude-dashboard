"use client";

import { useState, useMemo } from "react";
import { Wand2, Copy, Check, ChevronDown } from "lucide-react";

const ACCENT = "#f472b6";

type Template = {
    name: string;
    language: string;
    style: string;
    testing: string;
    rules: string;
    instructions: string;
};

const TEMPLATES: Record<string, Template> = {
    "Next.js Project": {
        name: "my-nextjs-app",
        language: "TypeScript, Next.js 15, React 19, Tailwind CSS",
        style: "Functional components only. Use server components by default. Prefer named exports. Use absolute imports with @/ prefix.",
        testing: "Playwright for E2E tests. Vitest for unit tests. Test files colocated next to source files.",
        rules: "Never use 'any' type. Never use default exports for components. Never modify next.config without approval. Never install new dependencies without asking.",
        instructions: "Follow the app router conventions. Use server actions for mutations. Keep client components minimal.",
    },
    "Python Project": {
        name: "my-python-project",
        language: "Python 3.12, FastAPI, SQLAlchemy, Pydantic",
        style: "Type hints everywhere. Use dataclasses or Pydantic models. Follow PEP 8. Max line length 100.",
        testing: "pytest with pytest-asyncio. Use fixtures for DB setup. Coverage target 80%+.",
        rules: "Never use bare except. Never commit .env files. Never use global state. Never ignore type errors.",
        instructions: "Use async/await for I/O operations. Keep endpoint handlers thin - business logic in services.",
    },
    "Go Project": {
        name: "my-go-project",
        language: "Go 1.22, standard library, chi router",
        style: "Follow effective Go. Short variable names in tight scopes. Exported types have doc comments. Error wrapping with fmt.Errorf.",
        testing: "Table-driven tests. Use testify/assert. Benchmark critical paths.",
        rules: "Never ignore errors. Never use init(). Never use global mutable state. Never use panic for control flow.",
        instructions: "Keep interfaces small. Accept interfaces, return structs. Use context for cancellation.",
    },
    General: {
        name: "my-project",
        language: "",
        style: "Clean, readable code. Consistent naming conventions. Small functions with single responsibility.",
        testing: "Write tests for new features and bug fixes. Maintain existing test coverage.",
        rules: "Never commit secrets or credentials. Never force push to main. Never skip code review.",
        instructions: "",
    },
};

function generateMarkdown(fields: {
    projectName: string;
    language: string;
    style: string;
    testing: string;
    rules: string;
    instructions: string;
}): string {
    const sections: string[] = [];

    sections.push(`# ${fields.projectName || "Project"}\n`);

    if (fields.language.trim()) {
        sections.push(`## Tech Stack\n${fields.language.trim()}\n`);
    }

    if (fields.style.trim()) {
        sections.push(`## Coding Style\n${fields.style.trim()}\n`);
    }

    if (fields.testing.trim()) {
        sections.push(`## Testing\n${fields.testing.trim()}\n`);
    }

    if (fields.rules.trim()) {
        const ruleLines = fields.rules
            .split(/\n|\.(?=\s)/)
            .map((r) => r.trim())
            .filter(Boolean)
            .map((r) => `- ${r.replace(/^-\s*/, "")}`);
        sections.push(`## Rules\n${ruleLines.join("\n")}\n`);
    }

    if (fields.instructions.trim()) {
        sections.push(`## Instructions\n${fields.instructions.trim()}\n`);
    }

    return sections.join("\n");
}

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.1)",
    background: "rgba(255,255,255,0.04)",
    color: "#fff",
    fontSize: 13,
    fontFamily: "inherit",
    outline: "none",
    transition: "border-color 0.15s",
};

const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "rgba(255,255,255,0.5)",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    marginBottom: 6,
};

export default function GeneratorPage() {
    const [projectName, setProjectName] = useState("");
    const [language, setLanguage] = useState("");
    const [style, setStyle] = useState("");
    const [testing, setTesting] = useState("");
    const [rules, setRules] = useState("");
    const [instructions, setInstructions] = useState("");
    const [copied, setCopied] = useState(false);
    const [templateOpen, setTemplateOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

    const markdown = useMemo(
        () => generateMarkdown({ projectName, language, style, testing, rules, instructions }),
        [projectName, language, style, testing, rules, instructions],
    );

    function applyTemplate(name: string) {
        const t = TEMPLATES[name];
        setProjectName(t.name);
        setLanguage(t.language);
        setStyle(t.style);
        setTesting(t.testing);
        setRules(t.rules);
        setInstructions(t.instructions);
        setSelectedTemplate(name);
        setTemplateOpen(false);
    }

    async function copyToClipboard() {
        try {
            await navigator.clipboard.writeText(markdown);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            /* clipboard not available */
        }
    }

    return (
        <div style={{ padding: "24px 28px", maxWidth: 1200, margin: "0 auto" }}>
            {/* Header */}
            <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <Wand2 size={20} style={{ color: ACCENT }} />
                    <h1 style={{ fontSize: 20, fontWeight: 800, color: "#fff", margin: 0 }}>
                        CLAUDE.md Generator
                    </h1>
                </div>
                <p style={{ fontSize: 13, color: "rgba(255,255,255,0.4)", margin: 0 }}>
                    Build a CLAUDE.md file for your project. Pick a template or fill in from scratch.
                </p>
            </div>

            {/* Template selector */}
            <div style={{ marginBottom: 20, position: "relative", display: "inline-block" }}>
                <button
                    onClick={() => setTemplateOpen(!templateOpen)}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "7px 14px",
                        borderRadius: 8,
                        fontSize: 12,
                        fontWeight: 600,
                        background: `${ACCENT}15`,
                        border: `1px solid ${ACCENT}40`,
                        color: ACCENT,
                        cursor: "pointer",
                    }}
                >
                    <Wand2 size={13} />
                    {selectedTemplate ?? "Choose a template"}
                    <ChevronDown
                        size={12}
                        style={{
                            opacity: 0.6,
                            transform: templateOpen ? "rotate(180deg)" : "none",
                            transition: "transform 0.15s",
                        }}
                    />
                </button>
                {templateOpen && (
                    <div
                        style={{
                            position: "absolute",
                            top: "calc(100% + 4px)",
                            left: 0,
                            zIndex: 50,
                            background: "#14151a",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: 8,
                            padding: 4,
                            minWidth: 180,
                            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        }}
                    >
                        {Object.keys(TEMPLATES).map((name) => (
                            <button
                                key={name}
                                onClick={() => applyTemplate(name)}
                                style={{
                                    display: "block",
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "6px 10px",
                                    borderRadius: 6,
                                    fontSize: 12,
                                    fontWeight: selectedTemplate === name ? 700 : 500,
                                    color: selectedTemplate === name ? ACCENT : "rgba(255,255,255,0.6)",
                                    background: selectedTemplate === name ? `${ACCENT}15` : "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                }}
                            >
                                {name}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Two-column layout */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 24,
                    alignItems: "start",
                }}
                className="generator-grid"
            >
                {/* Left: Form */}
                <div
                    style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 12,
                        padding: 20,
                    }}
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                        <div>
                            <label style={labelStyle}>Project Name</label>
                            <input
                                value={projectName}
                                onChange={(e) => setProjectName(e.target.value)}
                                placeholder="my-awesome-project"
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Language / Framework</label>
                            <input
                                value={language}
                                onChange={(e) => setLanguage(e.target.value)}
                                placeholder="TypeScript, Next.js 15, React 19"
                                style={inputStyle}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Coding Style</label>
                            <textarea
                                value={style}
                                onChange={(e) => setStyle(e.target.value)}
                                placeholder="Functional components. Prefer named exports. Use absolute imports..."
                                rows={3}
                                style={{ ...inputStyle, resize: "vertical" }}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Testing Approach</label>
                            <textarea
                                value={testing}
                                onChange={(e) => setTesting(e.target.value)}
                                placeholder="Vitest for unit tests. Playwright for E2E..."
                                rows={3}
                                style={{ ...inputStyle, resize: "vertical" }}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Key Rules (don&apos;t do X)</label>
                            <textarea
                                value={rules}
                                onChange={(e) => setRules(e.target.value)}
                                placeholder="Never use 'any' type. Never force push to main..."
                                rows={3}
                                style={{ ...inputStyle, resize: "vertical" }}
                            />
                        </div>
                        <div>
                            <label style={labelStyle}>Custom Instructions</label>
                            <textarea
                                value={instructions}
                                onChange={(e) => setInstructions(e.target.value)}
                                placeholder="Additional guidance for Claude..."
                                rows={3}
                                style={{ ...inputStyle, resize: "vertical" }}
                            />
                        </div>
                    </div>
                </div>

                {/* Right: Preview */}
                <div
                    style={{
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: 12,
                        padding: 20,
                        position: "sticky",
                        top: 24,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 12,
                        }}
                    >
                        <span
                            style={{
                                fontSize: 11,
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.5)",
                                textTransform: "uppercase",
                                letterSpacing: "0.05em",
                            }}
                        >
                            Preview - CLAUDE.md
                        </span>
                        <button
                            onClick={copyToClipboard}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "5px 12px",
                                borderRadius: 6,
                                fontSize: 11,
                                fontWeight: 600,
                                background: copied ? "#22c55e20" : `${ACCENT}15`,
                                border: `1px solid ${copied ? "#22c55e60" : `${ACCENT}40`}`,
                                color: copied ? "#22c55e" : ACCENT,
                                cursor: "pointer",
                                transition: "all 0.15s",
                            }}
                        >
                            {copied ? <Check size={12} /> : <Copy size={12} />}
                            {copied ? "Copied!" : "Copy"}
                        </button>
                    </div>
                    <pre
                        style={{
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontSize: 12,
                            lineHeight: 1.6,
                            color: "rgba(255,255,255,0.7)",
                            fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', monospace",
                            background: "rgba(0,0,0,0.3)",
                            borderRadius: 8,
                            padding: 16,
                            margin: 0,
                            maxHeight: 520,
                            overflowY: "auto",
                            border: "1px solid rgba(255,255,255,0.05)",
                        }}
                    >
                        {markdown}
                    </pre>
                </div>
            </div>

            {/* Responsive styles */}
            <style>{`
                @media (max-width: 768px) {
                    .generator-grid {
                        grid-template-columns: 1fr !important;
                    }
                }
            `}</style>
        </div>
    );
}
