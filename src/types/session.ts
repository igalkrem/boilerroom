export interface SessionData {
  // Google (primary identity)
  googleUserId: string;
  googleEmail: string;
  googleName: string;
  googleAvatar?: string;

  // Snapchat (optional — added when user connects from Traffic Sources)
  snapAccessToken?: string;
  snapRefreshToken?: string;
  snapExpiresAt?: number;
  snapUserId?: string;

  // Meta Ads (optional — added when user connects from Traffic Sources)
  metaAccessToken?: string;
  metaExpiresAt?: number;  // unix ms; long-lived ~60 days; no refresh token
  metaUserId?: string;

  // Cached after /api/meta/ad-accounts for ownership checks
  metaAllowedAdAccountIds?: string[];

  // OAuth CSRF state — separate per provider to prevent flow collision
  googleOAuthState?: string;
  snapchatOAuthState?: string;
  metaOAuthState?: string;

  // Cached after /api/snapchat/ad-accounts for ownership checks
  allowedAdAccountIds?: string[];

  // Server-pinned upload paths keyed by Snapchat upload_id.
  // Prevents clients from supplying attacker-controlled addPath/finalizePath.
  pendingUploads?: Record<string, { addPath: string; finalizePath: string }>;
}
