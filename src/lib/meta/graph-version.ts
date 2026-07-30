/**
 * The single source of truth for the Graph API version.
 *
 * Previously hardcoded at five sites across four files, which is how the app drifted
 * onto v19.0 — past its availability window (21 May 2026) yet still answering, so the
 * risk was silent semantic change rather than an outage.
 *
 * v25.0 is available until 29 Jul 2028, the longest runway of the supported set.
 * v26.0 shipped 29 Jul 2026 and is deliberately not used yet — a version one day old
 * is where breaking changes surface first.
 *
 * Verified 2026-07-30 against the live API with a real token: me/adaccounts,
 * {account}/adsets, /campaigns, /insights, /adcreatives and me/businesses all return
 * 200 on v25.0 with the same shapes as v19.0.
 */
export const GRAPH_VERSION = "v25.0";

/** REST base for Graph calls. */
export const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;

/** The OAuth dialog lives on www.facebook.com, not graph.facebook.com. */
export const OAUTH_DIALOG = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
