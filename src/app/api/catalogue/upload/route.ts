import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextRequest, NextResponse } from "next/server";
import { getSession, isSessionValid } from "@/lib/session";

// dashboard/catalogue writes catalogue/<uuid>-<sanitized-name>. Single segment,
// so "../" cannot escape the prefix.
const CATALOGUE_PATH_RE = /^catalogue\/[0-9a-fA-F-]{36}-[A-Za-z0-9._-]{1,200}$/;

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
        // See silo/upload — the client chooses this path, so pin it to the
        // catalogue/ prefix or the token can overwrite the metadata config store.
        if (!CATALOGUE_PATH_RE.test(pathname)) {
          throw new Error("invalid_pathname");
        }
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
          maximumSizeInBytes: 20 * 1024 * 1024, // 20 MB
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    // A name over 200 chars (or with characters the sanitizer left in) fails
    // CATALOGUE_PATH_RE and used to surface as a bare "internal_error", which
    // reads as a server fault and gives the user nothing to act on. The path
    // shape is client-controlled, so name it as a bad request.
    if (err instanceof Error && err.message === "invalid_pathname") {
      return NextResponse.json(
        { error: "invalid_filename", detail: "File name must be 1-200 characters of letters, digits, dot, underscore or hyphen." },
        { status: 400 }
      );
    }
    return NextResponse.json({ error: "internal_error" }, { status: 400 });
  }
}
