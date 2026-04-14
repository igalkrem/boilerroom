export interface SessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // Unix ms: Date.now() + 3_600_000
  snapUserId?: string;
  oauthState?: string;
  allowedAdAccountIds?: string[]; // cached after /api/snapchat/ad-accounts for ownership checks
}
