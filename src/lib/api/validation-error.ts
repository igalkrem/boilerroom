import { NextResponse } from "next/server";
import type { ZodError } from "zod";

/**
 * Uniform 422/400 for a failed Zod parse.
 *
 * Routes used to return `parsed.error.flatten()` verbatim, which hands the caller
 * the internal field structure (SEC-28). Nothing on the client ever read the
 * `details` object, so nothing is lost by narrowing it: the caller now gets a flat
 * list of "path: message" strings, which is what a human debugging a failed launch
 * actually wants, while the full flatten() goes to the server log.
 */
export function invalidRequest(
  error: ZodError,
  status: 400 | 422 = 422,
  logLabel?: string
): NextResponse {
  console.error(
    `[${logLabel ?? "validation"}] request rejected:`,
    JSON.stringify(error.flatten())
  );
  const issues = error.issues.map(
    (i) => `${i.path.length ? i.path.join(".") : "(root)"}: ${i.message}`
  );
  return NextResponse.json({ error: "invalid_request", issues }, { status });
}
