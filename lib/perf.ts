/**
 * Lightweight server-side performance monitoring — no new infrastructure, no
 * cost. `time()` measures an async block (typically a page's data-loading
 * step) and logs it. Anything over `SLOW_MS` logs as a warning so it stands
 * out; everything else logs at info level for a full trace when needed.
 *
 * These logs show up in Vercel's Runtime Logs (Project → Logs), searchable by
 * route — that's the "which pages are slow" view. For real Core Web Vitals
 * (time-to-first-byte, render time as experienced in the browser), Vercel
 * Speed Insights is wired in via `<SpeedInsights />` in the root layout, which
 * gives a dashboard under the Vercel project's "Speed Insights" tab.
 */

const SLOW_MS = 400;

/**
 * Measure and log an async block. Returns its result unchanged. Accepts
 * anything `await`-able, including Supabase's query builders — which are
 * thenables, not true Promise instances — so callers can pass an unawaited
 * builder straight through, e.g. `time("label", () => supabase.from(...).select(...))`.
 */
export async function time<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    const ms = Math.round(performance.now() - start);
    const line = `[perf] ${label} — ${ms}ms`;
    if (ms >= SLOW_MS) console.warn(line);
    else console.log(line);
  }
}
