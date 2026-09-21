import type { Context } from "hono";
import { ZodError } from "zod";
import { log } from "./log";

export type ErrorCode =
  | "bad_request" | "validation_error" | "unauthorized" | "forbidden" | "not_found" | "conflict"
  | "rate_limited" | "plan_limit" | "payment_required" | "idempotency_conflict" | "provider_error"
  | "not_configured" | "suspended" | "internal_error";

const statusFor: Record<ErrorCode, number> = {
  bad_request: 400, validation_error: 422, unauthorized: 401, forbidden: 403, not_found: 404, conflict: 409,
  rate_limited: 429, plan_limit: 402, payment_required: 402, idempotency_conflict: 409, provider_error: 502,
  not_configured: 503, suspended: 403, internal_error: 500,
};

export class ApiError extends Error {
  constructor(public code: ErrorCode, message: string, public details?: unknown) {
    super(message);
  }
  get status() {
    return statusFor[this.code];
  }
}

export const fail = (code: ErrorCode, message: string, details?: unknown): never => {
  throw new ApiError(code, message, details);
};

/** Standard error envelope: { error: { code, message, details?, request_id } } */
export function errorHandler(err: Error, c: Context) {
  const requestId = c.get("requestId" as never) as string | undefined;
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message, details: err.details, request_id: requestId } }, err.status as 400);
  }
  if (err instanceof ZodError) {
    return c.json({
      error: {
        code: "validation_error", message: "Request validation failed",
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })), request_id: requestId,
      },
    }, 422);
  }
  log.error("unhandled error", { err, path: c.req.path, requestId });
  return c.json({ error: { code: "internal_error", message: "Something went wrong. Please try again.", request_id: requestId } }, 500);
}
