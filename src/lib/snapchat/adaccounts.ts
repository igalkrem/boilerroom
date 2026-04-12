import { snapFetch } from "./client";
import type { SnapAdAccount } from "@/types/snapchat";

interface SnapOrganization {
  id: string;
  name: string;
}

export async function getAdAccounts(): Promise<SnapAdAccount[]> {
  // Step 1: Get the user's organizations
  const meData = await snapFetch<{
    organizations: Array<{ organization: SnapOrganization }>;
  }>("/me/organizations");

  const orgs = (meData.organizations ?? []).map((o) => o.organization);
  if (orgs.length === 0) return [];

  // Step 2: Get ad accounts for each organization
  const allAccounts: SnapAdAccount[] = [];

  for (const org of orgs) {
    const data = await snapFetch<{
      adaccounts: Array<{ adaccount: SnapAdAccount }>;
    }>(`/organizations/${org.id}/adaccounts`);

    const accounts = (data.adaccounts ?? []).map((item) => item.adaccount);
    allAccounts.push(...accounts);
  }

  return allAccounts;
}
