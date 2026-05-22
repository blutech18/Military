"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

// Route-to-role matrix — must stay in sync with sidebar ALL_ITEMS.
// "*" means any authenticated user. Unlisted routes default to "*".
const ROUTE_ROLES: Record<string, string[] | "*"> = {
  "/dashboard":     "*",
  "/firearms":      ["Administrator", "Command Officer", "S4 Officer", "Armory Custodian", "Personnel"],
  "/scan":          ["Administrator", "S4 Officer", "Armory Custodian", "Personnel"],
  "/transactions":  ["Administrator", "Command Officer", "S4 Officer", "Armory Custodian", "Personnel"],
  "/gps":           ["Administrator", "Command Officer", "S4 Officer", "Armory Custodian"],
  "/geofences":     ["Administrator", "S4 Officer"],
  "/maintenance":   ["Administrator", "S4 Officer", "Armory Custodian"],
  "/notifications": "*",
  "/audit":         ["Administrator", "Command Officer", "S4 Officer"],
  "/users":         ["Administrator"],
  "/reports":       ["Administrator", "Command Officer", "S4 Officer", "Armory Custodian"],
  "/settings":      "*",
};

function isAllowed(pathname: string, role: string | null | undefined): boolean {
  // Find the matching route prefix (longest match wins)
  const match = Object.keys(ROUTE_ROLES)
    .filter((r) => pathname === r || pathname.startsWith(r + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (!match) return true; // unlisted routes default to allowed
  const allowed = ROUTE_ROLES[match];
  if (allowed === "*") return true;
  return !!role && allowed.includes(role);
}

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const loaded = useAuthStore((s) => s.loaded);
  const token  = useAuthStore((s) => s.token);
  const user   = useAuthStore((s) => s.user);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (loaded && !token) router.replace("/login");
  }, [loaded, token, router]);

  useEffect(() => {
    if (loaded && token && user && !isAllowed(pathname, user.role)) {
      router.replace("/dashboard");
    }
  }, [loaded, token, user, pathname, router]);

  if (!loaded) return null;
  if (!token)  return null;
  if (user && !isAllowed(pathname, user.role)) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar mobileOpen={mobileMenuOpen} onClose={() => setMobileMenuOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <Topbar onMenuClick={() => setMobileMenuOpen(true)} />
        <main className="flex-1 overflow-y-auto px-4 lg:px-8 py-6 animate-fade-in">
          {children}
        </main>
      </div>
    </div>
  );
}
