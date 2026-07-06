export interface AdAccountConfig {
  id: string;               // Snapchat or Meta ad account ID
  name: string;             // Display name (cached from API)
  hidden: boolean;          // Hide from campaign creation flows
  feedProviderIds: string[]; // Feed providers this account is assigned to
  platform?: "snap" | "meta"; // Traffic source platform (defaults to "snap" for legacy records)
  updatedAt: string;        // ISO timestamp
}
