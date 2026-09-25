import Image from "next/image";
import type { CSSProperties } from "react";

export const JEV_PINK = "#E85DBF";

// Jev's own mark (typesafe.ai cube on pink), sized like a lucide icon so the
// sidebar and the overview card can drop it in wherever an Icon goes.
export default function JevMark({ size = 16, style }: { size?: number; style?: CSSProperties }) {
    return <Image src="/jev-logo.png" alt="" width={size} height={size} style={{ borderRadius: 999, flexShrink: 0, ...style }} />;
}
