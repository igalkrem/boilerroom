export interface BuildLogSession {
  id: string;
  timestamp: string; // ISO 8601 — the moment the build was launched
  squads: BuildLogSquad[];
}

export interface BuildLogSquad {
  adAccountId: string;
  campaignSnapId: string;
  campaignName: string;
  adSquadSnapId: string;
  adSquadName: string;
  status: "ACTIVE" | "PAUSED" | "DELETED";
  creativeCount: number;
  adCount: number;
  budgetMicro?: number; // stored at launch time if available
  bidMicro?: number;
  error?: string;
  timestamp: string; // ISO 8601 — creation time of THIS squad (for HH:MM:SS column)
}
