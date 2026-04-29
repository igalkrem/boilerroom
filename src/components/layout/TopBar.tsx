"use client";

import { useState, useRef, useEffect } from "react";
import { useSnapchatAuth } from "@/hooks/useSnapchatAuth";

export function TopBar() {
  const { googleName, googleEmail, googleAvatar } = useSnapchatAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleDisconnect = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  const initials = googleName
    ? googleName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <header className="h-12 bg-gray-950 border-b border-gray-800 flex items-center justify-end px-4 shrink-0">
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-full focus:outline-none focus:ring-2 focus:ring-cyan-500"
          aria-label="User menu"
        >
          {googleAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={googleAvatar}
              alt={googleName ?? "User"}
              className="w-8 h-8 rounded-full object-cover ring-2 ring-gray-700"
              referrerPolicy="no-referrer"
            />
          ) : (
            <span className="w-8 h-8 rounded-full bg-cyan-600 flex items-center justify-center text-xs font-bold text-white ring-2 ring-gray-700">
              {initials}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-56 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800">
              <p className="text-sm font-semibold text-white truncate">{googleName}</p>
              <p className="text-xs text-gray-400 truncate mt-0.5">{googleEmail}</p>
            </div>
            <div className="p-2">
              <button
                onClick={handleDisconnect}
                className="w-full text-left px-3 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-gray-800 rounded-lg transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}
