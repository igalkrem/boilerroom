import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSession, isSessionValid, isSnapchatConnected, isAdAccountAllowed } from "@/lib/session";
import { syncAccount } from "@/lib/reporting/sync-logic";

export const maxDuration = 300;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const syncBodySchema = z.object({
  adAccountId: z.string().min(1),
  startDate: z.string().regex(DATE_RE, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(DATE_RE, "endDate must be YYYY-MM-DD"),
  timezone: z.string().optional(),
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
  if (!isSnapchatConnected(session)) {
    return NextResponse.json({ error: "snapchat_not_connected" }, { status: 403 });
  }

  const rawBody = await request.json().catch(() => null);
  const parsed = syncBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  const { adAccountId, startDate, endDate, timezone = "America/Los_Angeles", force = false } = parsed.data;

  if (!isAdAccountAllowed(session, adAccountId)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Pass undefined for accessToken so snapFetch uses the session (with its refresh logic).
  const result = await syncAccount(adAccountId, startDate, endDate, timezone, undefined, force);
  return NextResponse.json({ snapchat: result.snapchat, visymo: result.visymo, predicto: result.predicto });
}
