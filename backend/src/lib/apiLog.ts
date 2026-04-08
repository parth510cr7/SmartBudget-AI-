/**
 * Structured one-line logs for debugging basket / app-query flows.
 * Disabled in production unless API_DEBUG_LOG=1.
 */
export function apiLog(scope: string, event: string, data: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production" && process.env.API_DEBUG_LOG !== "1") return;
  console.log(
    JSON.stringify({
      ts: new Date().toISOString(),
      scope,
      event,
      ...data,
    })
  );
}
