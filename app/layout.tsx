import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claude Dashboard - The Missing GUI for Claude Code",
  description: "See your sessions, memory, skills, hooks, MCP servers, and settings - all in one beautiful, local-first dashboard. Zero config. No database.",
  icons: { icon: "/claude-logo.png" },
  openGraph: {
    title: "Claude Dashboard",
    description: "The missing GUI for Claude Code. Browse sessions, memory, skills, hooks, MCP servers, and settings - zero config, no database.",
    type: "website",
    url: "https://github.com/bunlongheng/claude-dashboard",
    images: [{ url: "/screenshot.png", width: 1280, height: 800 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Claude Dashboard",
    description: "The missing GUI for Claude Code. Zero config, no database.",
    images: ["/screenshot.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, interactive-widget=resizes-content" />
      </head>
      <body>{children}</body>
    </html>
  );
}
