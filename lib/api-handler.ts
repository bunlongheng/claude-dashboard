import { NextResponse } from "next/server";

// Wrap a route handler so an uncaught error returns the { error } JSON shape the
// rest of the API uses, instead of an opaque Next.js 500 with a stack trace.
// Keeps the handler's own context type (e.g. dynamic-route params) intact.
export function withErrorHandler<R extends Request = Request, C = unknown>(
    handler: (req: R, ctx: C) => Promise<Response> | Response,
) {
    return async (req: R, ctx: C): Promise<Response> => {
        try {
            return await handler(req, ctx);
        } catch (e) {
            const message = e instanceof Error ? e.message : "internal error";
            return NextResponse.json({ error: message }, { status: 500 });
        }
    };
}
