import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the read-only endpoints used by the UI are exposed through this proxy.
const endpoints = new Set([
  "health", "meta", "timeseries", "calendar", "compare", "cells", "cells/years",
  "fires", "capture", "cases", "method/detection-curves", "export/timeseries.csv", "export/cells.csv",
]);

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const endpoint = path.join("/");
  if (!endpoints.has(endpoint)) return Response.json({ detail: "Not found" }, { status: 404 });

  // Bindings exist at function runtime, never during builds or in the browser.
  const base = process.env.BACKEND_URL || (!process.env.VERCEL ? "http://127.0.0.1:8000/" : undefined);
  if (!base) return Response.json({ detail: "Backend service binding is unavailable" }, { status: 503 });
  const url = new URL(endpoint, base.endsWith("/") ? base : `${base}/`);
  url.search = request.nextUrl.search;
  try {
    const upstream = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(60000) });
    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const key of ["content-type", "content-disposition"]) {
      const value = upstream.headers.get(key);
      if (value) headers.set(key, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return Response.json({ detail: "Backend service is unavailable" }, { status: 502 });
  }
}
