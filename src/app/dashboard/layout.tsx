import { AuthGuard } from "@/components/layout/AuthGuard";
import { TopNav } from "@/components/layout/TopNav";
import { KVHydrationProvider } from "@/components/layout/KVHydrationProvider";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <KVHydrationProvider>
        <div className="min-h-screen flex flex-col bg-gray-50">
          <TopNav />
          <main className="flex-1 px-6 py-8 max-w-6xl mx-auto w-full">{children}</main>
        </div>
      </KVHydrationProvider>
    </AuthGuard>
  );
}
