"use client";

import { useSnapchatAuth } from "@/hooks/useSnapchatAuth";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Spinner } from "@/components/ui";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { authenticated, isLoading } = useSnapchatAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !authenticated) {
      router.replace("/login");
    }
  }, [authenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!authenticated) return null;

  return <>{children}</>;
}
