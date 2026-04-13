import { redirect } from "next/navigation";
import { getSession, isSessionValid } from "@/lib/session";
import Link from "next/link";

interface Props {
  searchParams: { error?: string };
}

const errorMessages: Record<string, string> = {
  missing_params: "Authorization failed. Please try again.",
  invalid_state: "Security check failed. Please try again.",
  token_exchange_failed: "Could not connect to Snapchat. Please try again.",
  access_denied: "Access was denied. Please allow the required permissions.",
};

export default async function LoginPage({ searchParams }: Props) {
  const session = await getSession();
  if (isSessionValid(session)) redirect("/dashboard");

  const error = searchParams.error;

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

          <Link
            href="/api/auth/login"
            className="block w-full py-3 px-4 bg-cyan-500 hover:bg-cyan-400 text-gray-950 font-semibold rounded-lg transition-colors text-sm"
          >
            Connect with Snapchat
          </Link>

          <p className="mt-4 text-xs text-gray-500">
            Sign in with your Snapchat Business account to manage ad campaigns.
          </p>
        </div>
      </div>
    </div>
  );
}
