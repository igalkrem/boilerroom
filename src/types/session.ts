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

  // OAuth CSRF state — separate per provider to prevent flow collision
  googleOAuthState?: string;
  snapchatOAuthState?: string;

  // Cached after /api/snapchat/ad-accounts for ownership checks
  allowedAdAccountIds?: string[];
}
