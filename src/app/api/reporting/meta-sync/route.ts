import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isSessionValid, isMetaAdAccountAllowed, isMetaConnected } from "@/lib/session";
import { syncMetaAccount } from "@/lib/reporting/sync-logic";

export const maxDuration = 300;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const syncBodySchema = z.object({
  adAccountId: z.string().min(1),
  startDate: z.string().regex(DATE_RE, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(DATE_RE, "endDate must be YYYY-MM-DD"),
  force: z.boolean().optional(),
}).refine((d) => {
  const start = new Date(d.startDate);
  const end = new Date(d.endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return false;
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays <= 90;
}, { message: "Date range must be between 0 and 90 days" });

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }
  if (!isMetaConnected(session)) {
    return NextResponse.json({ error: "meta_not_connected" }, { status: 403 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = syncBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { adAccountId, startDate, endDate, force = false } = parsed.data;

  if (!isMetaAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const result = await syncMetaAccount(adAccountId, startDate, endDate, session.metaAccessToken!, force);
  return NextResponse.json(result);
}
