import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";

// SiloUploader writes silo/<uuid>/<original_|optimized_|thumb_><safe-name>.
// No slashes beyond the two shown, so "../" cannot escape the prefix.
const SILO_PATH_RE = /^silo\/[0-9a-fA-F-]{36}\/[A-Za-z0-9._-]{1,200}$/;

export async function POST(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!isSessionValid(session)) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        // The client picks the pathname, so it must be constrained here or an
        // upload token can write anywhere in the shared store — including over
        // metadata/{googleUserId}/*.json, which is the trusted config store this
        // app rehydrates from on every dashboard mount.
        if (!SILO_PATH_RE.test(pathname)) {
          throw new Error("invalid_pathname");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/quicktime", "video/webm"],
          maximumSizeInBytes: 500 * 1024 * 1024, // 500 MB
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch {
    return NextResponse.json({ error: "internal_error" }, { status: 400 });
  }
}
