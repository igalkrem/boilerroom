export interface AdAccountConfig {
  id: string;               // Snapchat ad account ID
  name: string;             // Display name (cached from Snapchat API)
  hidden: boolean;          // Hide from campaign creation flows
  feedProviderIds: string[]; // Feed providers this account is assigned to
  updatedAt: string;        // ISO timestamp
}
