import { snapFetch } from "./client";

type ProfilesResponse = {
  profiles?: Array<{ profile: { id: string; name: string } }>;
};

/**
 * Returns the first Snapchat Public Profile ID for the given ad account.
 * The profile_id is required in creative payloads (E2006 if absent).
 *
 * Tries two endpoints in order:
 *   1. GET /adaccounts/{adAccountId}/profiles  (direct, no org lookup)
 *   2. GET /me/organizations → match org → GET /organizations/{orgId}/profiles
 */
export async function getFirstProfileId(adAccountId: string): Promise<string | null> {
  // Attempt 1: ad-account-scoped profiles endpoint
  try {
    const data = await snapFetch<ProfilesResponse>(`/adaccounts/${adAccountId}/profiles`);
    const id = data.profiles?.[0]?.profile?.id;
    if (id) {
      console.log(`[profiles] found via adaccount endpoint: ${id}`);
      return id;
    }
    console.warn(`[profiles] adaccount endpoint returned no profiles`);
  } catch (err) {
    console.warn(`[profiles] /adaccounts/${adAccountId}/profiles failed:`, err);
  }

  // Attempt 2: org-scoped profiles endpoint
  let orgsData: { organizations?: Array<{ organization: { id: string } }> };
  try {
    orgsData = await snapFetch<{
      organizations: Array<{ organization: { id: string } }>;
    }>("/me/organizations");
  } catch (err) {
    console.warn("[profiles] /me/organizations failed:", err);
    return null;
  }

  const orgs = (orgsData.organizations ?? []).map((o) => o.organization);
  console.log(`[profiles] trying org endpoint — ${orgs.length} org(s)`);

  for (const org of orgs) {
    try {
      const data = await snapFetch<ProfilesResponse>(`/organizations/${org.id}/profiles`);
      const id = data.profiles?.[0]?.profile?.id;
      if (id) {
        console.log(`[profiles] found via org ${org.id}: ${id}`);
        return id;
      }
    } catch (err) {
      console.warn(`[profiles] /organizations/${org.id}/profiles failed:`, err);
    }
  }

  // Fallback: env var configured manually from Snapchat Business Manager
  const envProfileId = process.env.SNAPCHAT_PROFILE_ID;
  if (envProfileId) {
    console.log(`[profiles] using SNAPCHAT_PROFILE_ID env fallback: ${envProfileId}`);
    return envProfileId;
  }

  console.warn(`[profiles] all endpoints exhausted and no SNAPCHAT_PROFILE_ID env var set`);
  return null;
}
