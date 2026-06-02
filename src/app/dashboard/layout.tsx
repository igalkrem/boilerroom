import { redirect } from "next/navigation";
import { getSession, isSessionValid } from "@/lib/session";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { KVHydrationProvider } from "@/components/layout/KVHydrationProvider";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!isSessionValid(session)) {
    redirect("/login");
  }
  return (
    <AuthGuard>
      <KVHydrationProvider>
        <div className="flex h-screen bg-gray-900 overflow-hidden">
          <Sidebar />
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <TopBar />
            <main className="flex-1 overflow-auto p-6">{children}</main>
          </div>
        </div>
      </KVHydrationProvider>
    </AuthGuard>
  );
}
