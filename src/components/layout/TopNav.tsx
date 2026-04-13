"use client";

import { Button } from "@/components/ui";
import Link from "next/link";

export function TopNav() {
  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <header className="bg-gray-950 border-b border-gray-800 px-6 py-3 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-2">
        <span className="text-xl font-black tracking-tight bg-gradient-to-r from-cyan-300 to-cyan-500 bg-clip-text text-transparent">
          BoilerRoom
        </span>
      </Link>
      <Button variant="secondary" size="sm" onClick={handleLogout}>
        Disconnect
      </Button>
    </header>
  );
}
