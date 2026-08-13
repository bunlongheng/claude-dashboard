import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { withErrorHandler } from "@/lib/api-handler";

export const GET = withErrorHandler(async (req: NextRequest) => {
    const url = req.nextUrl.searchParams.get("url");
    if (!url) {
        return NextResponse.json({ error: "Missing ?url=" }, { status: 400 });
    }

    const svg = await QRCode.toString(url, {
        type: "svg",
        margin: 1,
        color: {
            dark: "#94a3b8",
            light: "#09090b",
        },
    });

    return new NextResponse(svg, {
        headers: {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "public, max-age=86400",
        },
    });
}) as (req: NextRequest) => Promise<Response>;
