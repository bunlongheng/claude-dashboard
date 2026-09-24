import { EVAL_CONFIGS, type EvalConfig } from "./rag-db";

// What each memory mode actually needs to run, and whether this install has it.
//
// The modes are not equally cheap. Plain retrieval is FTS5 over a local SQLite
// file - no key, no model, always available. On top of that sit 2 optional
// layers: vector search needs @huggingface/transformers (an optional dep, not
// in a default install), and KP synthesis needs a working Anthropic key. Either
// can be missing on a perfectly healthy machine, so the answer is probed rather
// than assumed.

export type ModeStatus = { key: EvalConfig; available: boolean; reason?: string };

// The mode every unavailable one degrades to. Retrieval with no enrichment is
// the floor: it is the useful thing that cannot fail for a missing dependency.
export const FALLBACK_MODE: EvalConfig = "rag";

const EMBED_REASON = "needs @huggingface/transformers";
const SYNTH_REASON = "ANTHROPIC_API_KEY missing or rejected";

// Resolved once per process. The answer is a property of the install, not of
// the request, and the import is expensive enough not to repeat per session.
let embeddingsProbe: Promise<boolean> | null = null;

export async function embeddingsAvailable(): Promise<boolean> {
    if (!embeddingsProbe) {
        embeddingsProbe = (async () => {
            // Same specifier-in-a-variable trick as lib/eval/embeddings.ts, for
            // the same reason: keep the bundler from statically requiring an
            // optional dependency that is usually absent.
            const pkg = "@huggingface/transformers";
            try {
                await import(/* webpackIgnore: true */ pkg);
                return true;
            } catch {
                return false;
            }
        })();
    }
    return embeddingsProbe;
}

// Presence is not the question - a rotated or revoked key is set and still 401s,
// which is the state this install is actually in. Probe it for real, once per
// process, with the smallest call the API will take.
let synthesisProbe: Promise<boolean> | null = null;

export async function synthesisAvailable(): Promise<boolean> {
    if (!process.env.ANTHROPIC_API_KEY) return false;
    if (!synthesisProbe) {
        synthesisProbe = (async () => {
            try {
                const { default: Anthropic } = await import("@anthropic-ai/sdk");
                await new Anthropic().messages.create({
                    model: "claude-haiku-4-5-20251001",
                    max_tokens: 1,
                    messages: [{ role: "user", content: "." }],
                });
                return true;
            } catch {
                return false;
            }
        })();
    }
    return synthesisProbe;
}

export async function modeStatuses(): Promise<ModeStatus[]> {
    const [vectors, synth] = await Promise.all([embeddingsAvailable(), synthesisAvailable()]);

    return EVAL_CONFIGS.map(key => {
        const needsVectors = key === "rag_vector" || key === "rag_vector_kp";
        const needsSynth = key === "kp" || key === "rag_vector_kp";

        if (needsVectors && !vectors) return { key, available: false, reason: EMBED_REASON };
        if (needsSynth && !synth) return { key, available: false, reason: SYNTH_REASON };
        return { key, available: true };
    });
}

// Resolves whatever is stored into something that can actually run. A mode that
// was valid when it was picked can stop being valid later - a dependency goes
// missing, a key is rotated - and a session should lose its enrichment, not its
// memory, when that happens.
export async function resolveMode(stored: EvalConfig | null): Promise<{ mode: EvalConfig; fallbackFrom?: EvalConfig; reason?: string }> {
    if (!stored) return { mode: FALLBACK_MODE };

    const status = (await modeStatuses()).find(s => s.key === stored);
    if (!status) return { mode: FALLBACK_MODE, fallbackFrom: stored, reason: "unknown mode" };
    if (status.available) return { mode: stored };

    return { mode: FALLBACK_MODE, fallbackFrom: stored, reason: status.reason };
}
