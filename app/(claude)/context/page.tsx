export const dynamic = "force-dynamic";
import ContextSection from "../_sections/ContextSection";
import RagDisabledNotice from "../_sections/RagDisabledNotice";
import { RAG_ENABLED } from "@/lib/features";

export default function ContextPage() {
    if (!RAG_ENABLED) return <RagDisabledNotice feature="Context" />;
    return <ContextSection />;
}
