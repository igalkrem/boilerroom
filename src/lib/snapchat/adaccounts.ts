import { snapFetch } from "./client";
import type { SnapAdAccount } from "@/types/snapchat";

export async function getAdAccounts(): Promise<SnapAdAccount[]> {
  const data = await snapFetch<{
    adaccounts: Array<{ adaccount: SnapAdAccount }>;
  }>("/me/adaccounts");
  return (data.adaccounts ?? []).map((item) => item.adaccount);
}
