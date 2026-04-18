"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Mic, MicOff, Send, X } from "lucide-react";

interface VoiceModalProps {
    onSubmit: (text: string) => void;
    onClose: () => void;
}

export default function VoiceModal({ onSubmit, onClose }: VoiceModalProps) {
    const [listening, setListening] = useState(false);
    const [transcript, setTranscript] = useState("");
    const [interim, setInterim] = useState("");
    const [error, setError] = useState("");
    const recognitionRef = useRef<any>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const animFrameRef = useRef<number>(0);
    const streamRef = useRef<MediaStream | null>(null);

    const drawWave = useCallback(() => {
        const canvas = canvasRef.current;
        const analyser = analyserRef.current;
        if (!canvas || !analyser) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const draw = () => {
            animFrameRef.current = requestAnimationFrame(draw);
            analyser.getByteTimeDomainData(dataArray);

            const w = canvas.width;
            const h = canvas.height;
            ctx.clearRect(0, 0, w, h);

            // Glow effect
            ctx.shadowBlur = 15;
            ctx.shadowColor = "#f97316";

            ctx.lineWidth = 2.5;
            ctx.strokeStyle = "#f97316";
            ctx.beginPath();

            const sliceWidth = w / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = (v * h) / 2;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
            }

            ctx.lineTo(w, h / 2);
            ctx.stroke();

            // Second wave (dimmer, offset)
            ctx.shadowBlur = 8;
            ctx.shadowColor = "#f9731650";
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = "rgba(249,115,22,0.3)";
            ctx.beginPath();
            x = 0;
            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = (v * h) / 2 + 4;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
                x += sliceWidth;
            }
            ctx.lineTo(w, h / 2);
            ctx.stroke();

            ctx.shadowBlur = 0;
        };

        draw();
    }, []);

    const startListening = useCallback(async () => {
        setError("");
        setTranscript("");
        setInterim("");

        // Check browser support
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (!SpeechRecognition) {
            setError("Speech recognition not supported in this browser");
            return;
        }

        // Start microphone for waveform (optional - works without it)
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            streamRef.current = stream;

            const audioCtx = new AudioContext();
            const source = audioCtx.createMediaStreamSource(stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 2048;
            source.connect(analyser);
            analyserRef.current = analyser;
            drawWave();
        } catch {
            // Waveform won't show but speech recognition can still work
        }

        // Start speech recognition
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onresult = (e: any) => {
            let final = "";
            let inter = "";
            for (let i = 0; i < e.results.length; i++) {
                const result = e.results[i];
                if (result.isFinal) {
                    final += result[0].transcript + " ";
                } else {
                    inter += result[0].transcript;
                }
            }
            if (final) setTranscript(prev => prev + final);
            setInterim(inter);
        };

        recognition.onerror = (e: any) => {
            if (e.error !== "no-speech") setError(`Error: ${e.error}`);
        };

        recognition.onend = () => {
            setListening(false);
        };

        recognitionRef.current = recognition;
        recognition.start();
        setListening(true);
    }, [drawWave]);

    const stopListening = useCallback(() => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            recognitionRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
        }
        analyserRef.current = null;
        setListening(false);
    }, []);

    const handleSubmit = useCallback(() => {
        const text = (transcript + interim).trim();
        if (!text) return;
        stopListening();
        onSubmit(text);
        onClose();
    }, [transcript, interim, stopListening, onSubmit, onClose]);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopListening();
        };
    }, [stopListening]);

    // Auto-start on mount
    useEffect(() => {
        startListening();
    }, [startListening]);

    // Set canvas size
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            canvas.width = canvas.offsetWidth * 2;
            canvas.height = canvas.offsetHeight * 2;
        }
    }, []);

    const fullText = (transcript + interim).trim();

    return (
        <div className="fixed inset-0 z-[999] flex flex-col items-center justify-center p-4" style={{ background: "#08090d" }} onClick={onClose}>
            <div className="w-full max-w-lg" onClick={e => e.stopPropagation()}>

                {/* Close button */}
                <div className="flex justify-end mb-4">
                    <button onClick={() => { stopListening(); onClose(); }}
                        style={{ background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)", display: "flex" }}>
                        <X size={20} />
                    </button>
                </div>

                {/* Mic icon with pulse */}
                <div className="flex justify-center mb-6">
                    <div
                        onClick={listening ? stopListening : startListening}
                        className="cursor-pointer"
                        style={{
                            width: 80, height: 80, borderRadius: "50%",
                            background: listening ? "rgba(249,115,22,0.2)" : "rgba(255,255,255,0.05)",
                            border: listening ? "2px solid rgba(249,115,22,0.5)" : "2px solid rgba(255,255,255,0.1)",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            animation: listening ? "pulse 2s ease-in-out infinite" : "none",
                            transition: "all 0.3s",
                        }}
                    >
                        {listening ? <Mic size={32} color="#f97316" /> : <MicOff size={32} color="rgba(255,255,255,0.3)" />}
                    </div>
                </div>

                {/* Status */}
                <p className="text-center text-sm mb-4" style={{ color: listening ? "#f97316" : "rgba(255,255,255,0.3)" }}>
                    {listening ? "Listening..." : error || "Tap mic to start"}
                </p>

                {/* Waveform */}
                <div className="mb-6 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                    <canvas
                        ref={canvasRef}
                        style={{ width: "100%", height: 80, display: "block" }}
                    />
                </div>

                {/* Transcript */}
                <div className="rounded-xl p-4 mb-4" style={{
                    background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)",
                    minHeight: 80, maxHeight: 200, overflowY: "auto",
                }}>
                    {fullText ? (
                        <p style={{ fontSize: 14, lineHeight: 1.6, color: "#f8f8f2", margin: 0 }}>
                            {transcript}
                            {interim && <span style={{ color: "rgba(255,255,255,0.4)" }}>{interim}</span>}
                        </p>
                    ) : (
                        <p style={{ fontSize: 13, color: "rgba(255,255,255,0.2)", margin: 0, textAlign: "center", paddingTop: 20 }}>
                            Your words will appear here...
                        </p>
                    )}
                </div>

                {/* Submit button */}
                <div className="flex justify-center gap-3">
                    <button
                        onClick={handleSubmit}
                        disabled={!fullText}
                        className="flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-sm transition disabled:opacity-30"
                        style={{
                            background: fullText ? "#f97316" : "rgba(255,255,255,0.05)",
                            color: "#fff",
                            border: "none",
                            cursor: fullText ? "pointer" : "not-allowed",
                        }}
                    >
                        <Send size={16} />
                        Send to Claude
                    </button>
                </div>
            </div>

            <style>{`
                @keyframes pulse {
                    0%, 100% { box-shadow: 0 0 0 0 rgba(249,115,22,0.4); }
                    50% { box-shadow: 0 0 0 20px rgba(249,115,22,0); }
                }
            `}</style>
        </div>
    );
}
