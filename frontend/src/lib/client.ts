// The browser only talks to its own origin: /api/* is the Vercel function in
// api/[endpoint].js (or the Vite dev proxy), which forwards to the model API.
const API = "/api";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** FastAPI errors are {detail: string} or {detail: [{msg, loc}, ...]} (validation). */
function detailMessage(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d: { msg?: string }) => d.msg ?? "invalid input").join("; ");
  }
  if (status === 413) return "That file is too large to upload.";
  if (status === 502 || status === 504) return "The model server didn't respond. It may be restarting.";
  return `Request failed (HTTP ${status})`;
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, init);
  } catch {
    throw new ApiError("Network error: check your connection and try again.", 0);
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(detailMessage(body, res.status), res.status);
  return body as T;
}
