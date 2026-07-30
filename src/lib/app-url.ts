/**
 * The app's own origin, for OAuth redirect_uri construction and post-auth redirects.
 *
 * SEC-16: six call sites used `process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"`.
 * If that variable is ever missing or misspelled in a production environment, every
 * OAuth redirect_uri silently becomes localhost — the provider either rejects the
 * mismatched URI or, worse, a browser follows the redirect to whatever is listening
 * on port 3000 on the user's own machine, carrying the authorization code with it.
 *
 * Falling back is only safe when we know we are not in production, so gate on
 * NODE_ENV rather than on the variable being truthy.
 */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_APP_URL is not set. Refusing to fall back to http://localhost:3000 in production — " +
        "an OAuth redirect_uri pointing at localhost would send the authorization code to the user's own machine."
    );
  }
  return "http://localhost:3000";
}
