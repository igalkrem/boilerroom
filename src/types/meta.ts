export interface MetaTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number; // seconds
}

export interface MetaAdAccount {
  id: string; // "act_XXXXXXXXX" format
  name: string;
  account_status: number; // 1 = active, 2 = disabled, etc.
  currency: string;
  timezone_name: string;
}
