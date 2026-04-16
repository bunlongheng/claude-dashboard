import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";

export async function GET(req: NextRequest) {
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
}
