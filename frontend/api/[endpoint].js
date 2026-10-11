// Vercel serverless function: forwards /api/{health,version,predict} to the deployed
// model API named by the API_BASE_URL env var (Vercel project → Settings → Environment
// Variables), e.g. https://92-4-71-81.sslip.io/cnn.
//
// Going through this function keeps the browser on the Vercel origin, so the backend
// on the Oracle VM needs no CORS configuration and its URL lives only in Vercel's env.

const ALLOWED = new Set(["health", "version", "predict"]);
const MAX_BODY = 4 * 1024 * 1024; // Vercel caps request bodies at 4.5 MB

const json = (status, data) => Response.json(data, { status });

async function forward(request) {
  const base = (process.env.API_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return json(500, { detail: "API_BASE_URL is not set in the Vercel project" });

  const endpoint = new URL(request.url).pathname.split("/").pop();
  if (endpoint === "config") return json(200, { backend: base });
  if (!ALLOWED.has(endpoint)) return json(404, { detail: "unknown endpoint" });

  const init = {
    method: request.method,
    headers: { "Content-Type": "application/json" },
    signal: AbortSignal.timeout(30_000),
  };
  if (request.method === "POST") {
    init.body = await request.text();
    if (init.body.length > MAX_BODY) return json(413, { detail: "image too large" });
  }

  try {
    const upstream = await fetch(`${base}/${endpoint}`, init);
    return new Response(await upstream.text(), {
      status: upstream.status, // 4xx/5xx from the backend pass straight through
      headers: { "Content-Type": upstream.headers.get("content-type") || "application/json" },
    });
  } catch (e) {
    return json(502, { detail: `backend unreachable: ${e.cause?.code || e.message}` });
  }
}

export const GET = forward;
export const POST = forward;
