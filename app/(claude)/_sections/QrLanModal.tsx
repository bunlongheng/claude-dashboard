"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, Copy, Check, QrCode } from "lucide-react";
import QRCode from "qrcode";

export default function QrLanModal() {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const fetchLan = useCallback(async () => {
    try {
      const res = await fetch("/api/claude/lan");
      const data = await res.json();
      setUrl(data.url ?? "");
    } catch {
      setUrl("");
    }
  }, []);

  useEffect(() => {
    if (open && !url) fetchLan();
  }, [open, url, fetchLan]);

  useEffect(() => {
    if (open && url && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 180,
        margin: 2,
        color: { dark: "#ffffffee", light: "#00000000" },
      });
    }
  }, [open, url]);

  const handleCopy = async () => {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        title="LAN QR Code"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%", padding: "6px 10px", borderRadius: 8,
          fontSize: 11, fontWeight: 500,
          color: "rgba(255,255,255,0.35)", background: "none", border: "none",
          cursor: "pointer", transition: "background 0.12s",
        }}
        onMouseEnter={e => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
        onMouseLeave={e => (e.currentTarget.style.background = "none")}
      >
        <QrCode size={14} style={{ color: "rgba(255,255,255,0.25)" }} />
        <span>LAN Access</span>
      </button>
    );
  }

  return (
    <>
      {/* Trigger button (active state) */}
      <button
        onClick={() => setOpen(false)}
        title="Close QR"
        style={{
          display: "flex", alignItems: "center", gap: 8,
          width: "100%", padding: "6px 10px", borderRadius: 8,
          fontSize: 11, fontWeight: 600,
          color: "#06b6d4", background: "rgba(6,182,212,0.08)", border: "1px solid rgba(6,182,212,0.25)",
          cursor: "pointer",
        }}
      >
        <QrCode size={14} style={{ color: "#06b6d4" }} />
        <span>LAN Access</span>
      </button>

      {/* Modal overlay */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: "fixed", inset: 0, zIndex: 100,
          background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: "#16171e", border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 14, padding: 24, width: 260,
            boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 14,
          }}
        >
          {/* Close */}
          <div style={{ display: "flex", width: "100%", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.04em" }}>
              LAN Access
            </span>
            <button
              onClick={() => setOpen(false)}
              style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", display: "flex", padding: 2 }}
            >
              <X size={14} />
            </button>
          </div>

          {/* QR Canvas */}
          <div style={{
            background: "rgba(255,255,255,0.04)", borderRadius: 10, padding: 12,
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <canvas ref={canvasRef} style={{ display: "block", borderRadius: 6 }} />
          </div>

          {/* URL + Copy */}
          {url && (
            <div style={{
              display: "flex", alignItems: "center", gap: 6, width: "100%",
              background: "rgba(255,255,255,0.04)", borderRadius: 8, padding: "6px 10px",
              border: "1px solid rgba(255,255,255,0.06)",
            }}>
              <span style={{
                flex: 1, fontSize: 11, fontFamily: "monospace", color: "rgba(255,255,255,0.6)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {url}
              </span>
              <button
                onClick={handleCopy}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 2,
                  color: copied ? "#22c55e" : "rgba(255,255,255,0.35)", display: "flex",
                  transition: "color 0.15s",
                }}
                title="Copy URL"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
              </button>
            </div>
          )}

          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)" }}>
            Scan with your phone on the same network
          </span>
        </div>
      </div>
    </>
  );
}
