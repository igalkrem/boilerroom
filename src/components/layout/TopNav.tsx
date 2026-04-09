"use client";

import { Button } from "@/components/ui";
import Link from "next/link";

export function TopNav() {
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="text-2xl">👻</span>
        <span className="font-bold text-gray-900 text-lg">SnapAds Manager</span>
      </Link>
      <Button variant="secondary" size="sm" onClick={handleLogout}>
        Disconnect
      </Button>
    </header>
  );
}
