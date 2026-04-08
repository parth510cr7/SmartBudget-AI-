import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

const MAX_INCOMING_LEN = 128;

/**
 * Assigns a stable request id (honors X-Request-Id from client when present)
 * and echoes it on the response for tracing.
 */
export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers["x-request-id"];
  const fromClient = typeof raw === "string" ? raw.trim().slice(0, MAX_INCOMING_LEN) : "";
  const requestId = fromClient || randomUUID();
  // Note: keep this compatible with dev transpilers that miss module augmentation.
  (req as unknown as { requestId?: string }).requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}
