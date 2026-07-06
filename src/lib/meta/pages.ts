import { metaFetch } from "./client";

export interface MetaPage {
  id: string;
  name: string;
  access_token?: string;
}

export async function getPages(token?: string): Promise<MetaPage[]> {
  const data = await metaFetch<{ data: MetaPage[] }>(
    `/me/accounts?fields=id,name&limit=100`,
    {},
    token
  );
  return data.data ?? [];
}
