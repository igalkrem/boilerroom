import { redirect } from "next/navigation";
import { getSession, isSessionValid } from "@/lib/session";

interface Props {
  searchParams: Promise<{ error?: string }>;
}

const errorMessages: Record<string, string> = {
  missing_params: "Authorization failed. Please try again.",
  invalid_state: "Security check failed. Please try again.",
  token_exchange_failed: "Could not connect to Google. Please try again.",
  access_denied: "Access was denied. Please allow the required permissions.",
};

export default async function LoginPage({ searchParams }: Props) {
  const session = await getSession();
  if (isSessionValid(session)) redirect("/dashboard");

  const { error } = await searchParams;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="max-w-sm w-full mx-4">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-8 text-center">
          <h1 className="text-4xl font-black mb-1 tracking-tight bg-gradient-to-r from-cyan-300 to-cyan-500 bg-clip-text text-transparent">
            BoilerRoom
          </h1>
          <p className="text-sm text-gray-400 mb-8">Bulk Campaign Creation Platform</p>

          {error && (
            <div className="mb-4 px-4 py-3 bg-red-950 border border-red-800 rounded-lg text-sm text-red-400">
              {errorMessages[error] ?? "An error occurred. Please try again."}
            </div>
          )}

          <a
            href="/api/auth/google/login"
            className="flex items-center justify-center gap-3 w-full py-3 px-4 bg-white hover:bg-gray-100 text-gray-900 font-semibold rounded-lg transition-colors text-sm border border-gray-200"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              />
            </svg>
            Sign in with Google
          </a>

          <p className="mt-4 text-xs text-gray-500">
            Sign in with your Google account to access BoilerRoom.
          </p>
        </div>
      </div>
    </div>
  );
}
