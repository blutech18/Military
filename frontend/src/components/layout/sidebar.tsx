"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  BadgeCheck, Bell, ClipboardList, FileText, Fingerprint,
  Home, LogOut, MapPinned, QrCode, Settings, Shield, ShieldAlert, Users, Wrench, X, ChevronLeft, AlertTriangle, Loader2
} from "lucide-react";
import { useAuthStore, hasRole } from "@/store/auth";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";

const ALL_ITEMS = [
  { href: "/dashboard",     label: "Command Dashboard", icon: Home,           roles: "*" },
  { href: "/firearms",      label: "Firearms",          icon: Shield,         roles: ["Administrator","Command Officer","S4 Officer","Armory Custodian","Personnel"] },
  { href: "/scan",          label: "QR Scanner",        icon: QrCode,         roles: ["Administrator","S4 Officer","Armory Custodian","Personnel"] },
  { href: "/transactions",  label: "Transactions",      icon: ClipboardList,  roles: ["Administrator","Command Officer","S4 Officer","Armory Custodian","Personnel"] },
  { href: "/gps",           label: "GPS Tracking",      icon: MapPinned,      roles: ["Administrator","Command Officer","S4 Officer","Armory Custodian"] },
  { href: "/geofences",     label: "Geofences",         icon: MapPinned,      roles: ["Administrator","S4 Officer"] },
  { href: "/maintenance",   label: "Maintenance",       icon: Wrench,         roles: ["Administrator","S4 Officer","Armory Custodian"] },
  { href: "/notifications", label: "Notifications",     icon: Bell,           roles: "*" },
  { href: "/audit",         label: "Audit Trail",       icon: ShieldAlert,    roles: ["Administrator","Command Officer","S4 Officer"] },
  { href: "/users",         label: "User Management",   icon: Users,          roles: ["Administrator"] },
  { href: "/reports",       label: "Reports",           icon: FileText,       roles: ["Administrator","Command Officer","S4 Officer","Armory Custodian"] },
  { href: "/settings",      label: "Settings",          icon: Settings,       roles: "*" },
] as const;

interface SidebarProps {
  mobileOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({ mobileOpen = false, onClose }: SidebarProps) {
  const pathname = usePathname();
  const router   = useRouter();
  const user     = useAuthStore((s) => s.user);
  const clear    = useAuthStore((s) => s.clear);

  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar_collapsed") === "true";
    }
    return false;
  });

  const [ready, setReady] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  useEffect(() => {
    setReady(true);
  }, []);

  const toggleCollapse = () => {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("sidebar_collapsed", String(next));
  };

  const items = ALL_ITEMS.filter((item) =>
    item.roles === "*" || hasRole(user, ...item.roles as unknown as string[])
  );

  async function logout() {
    setLoggingOut(true);
    try { await api.post("/auth/logout"); } catch {}
    clear();
    router.replace("/login");
  }

  // Smooth opacity fade for text elements
  const fadeClass = cn(
    ready ? "transition-opacity duration-300 ease-in-out" : "",
    isCollapsed ? "lg:opacity-0" : "opacity-100"
  );

  return (
    <>
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
          onClick={onClose}
        />
      )}

      <aside
        className={cn(
          "fixed lg:sticky top-0 left-0 h-screen shrink-0 z-50 grid",
          "border-r border-olive-700/30 bg-steel-900",
          ready ? "transition-[grid-template-columns,transform] duration-300 ease-in-out" : "",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          isCollapsed ? "grid-cols-[224px] lg:grid-cols-[64px]" : "grid-cols-[224px]"
        )}
      >
        <button
          onClick={toggleCollapse}
          className={cn(
            "hidden lg:flex absolute -right-3 top-1/2 -translate-y-1/2 z-50",
            "h-6 w-6 rounded-full items-center justify-center",
            "bg-steel-800 border border-olive-700/50",
            "text-steel-400 hover:text-olive-100 hover:border-olive-500/70",
            ready ? "transition-transform duration-300" : "",
            isCollapsed && "rotate-180"
          )}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>

        <div className="flex flex-col h-full w-full overflow-hidden">
        {/* ── Header ── */}
        <div className={cn(
          "h-16 flex items-center pl-3 pr-3 border-b border-olive-700/30 shrink-0 w-full relative",
          ready ? "transition-[gap] duration-300" : "",
          isCollapsed ? "gap-0" : "gap-2"
        )}>
          <div className="h-10 w-10 flex items-center justify-center shrink-0">
            <BrandLogo size={38} className="object-contain" />
          </div>
          <div className={cn(
            "grid whitespace-nowrap min-w-0",
            ready ? "transition-[grid-template-columns,opacity] duration-300" : "",
            isCollapsed ? "grid-cols-[0fr] opacity-0" : "grid-cols-[1fr] opacity-100"
          )}>
            <div className="overflow-hidden min-w-0">
              <p className="text-sm font-bold text-olive-50 truncate">ArmoryDB</p>
              <p className="text-[10px] uppercase tracking-widest text-olive-300 truncate">10th RCDG</p>
            </div>
          </div>
          <button onClick={onClose} className="lg:hidden btn-ghost p-1.5 shrink-0 ml-auto" aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-4 min-h-0 w-full">
          <ul className="space-y-1 px-3">
            {items.map(({ href, label, icon: Icon }) => {
              const active = pathname === href || pathname.startsWith(href + "/");
              return (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={onClose}
                    title={label}
                    className={cn(
                      "flex items-center rounded-md px-3 py-2 text-sm whitespace-nowrap overflow-hidden w-full",
                      ready ? "transition-[gap,color] duration-300" : "",
                      isCollapsed ? "gap-0" : "gap-3",
                      active
                        ? "text-olive-300"
                        : "text-steel-400 hover:text-olive-100"
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <div className={cn(
                      "grid",
                      ready ? "transition-[grid-template-columns,opacity] duration-300" : "",
                      isCollapsed ? "grid-cols-[0fr] opacity-0" : "grid-cols-[1fr] opacity-100"
                    )}>
                      <span className="overflow-hidden">{label}</span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* ── Footer ── */}
        <div className={cn(
          "border-t border-olive-700/30 py-3 shrink-0 flex items-center w-full h-[60px]",
          ready ? "transition-[padding] duration-300" : "",
          isCollapsed ? "px-0 justify-center" : "px-3 justify-between"
        )}>
          {/* Avatar + role — collapses to 0 width via grid */}
          <div className={cn(
            "grid overflow-hidden shrink-0",
            ready ? "transition-[grid-template-columns,opacity] duration-300" : "",
            isCollapsed ? "grid-cols-[0fr] opacity-0" : "grid-cols-[1fr] opacity-100"
          )}>
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="h-8 w-8 rounded-full bg-tactical-light/40 flex items-center justify-center shrink-0">
                <Fingerprint className="h-3.5 w-3.5 text-olive-100" />
              </div>
              <p className="text-xs font-semibold text-olive-50 truncate whitespace-nowrap">{user?.role || "Administrator"}</p>
            </div>
          </div>

          {/* Logout — always visible, naturally centered when collapsed */}
          <button
            onClick={() => setShowLogoutModal(true)}
            title="Sign out"
            className="btn-ghost p-2 shrink-0"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        </div>
      </aside>

      {/* Logout Confirmation Modal */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showLogoutModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowLogoutModal(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="glass rounded-xl p-6 w-full max-w-sm space-y-4"
              >
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertTriangle className="h-5 w-5" />
                  <h3 className="text-sm font-bold uppercase tracking-widest">Sign Out</h3>
                </div>
                <p className="text-sm text-steel-300">
                  Are you sure you want to sign out? You will need to log in again to access the system.
                </p>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowLogoutModal(false)} className="btn-secondary text-xs">Cancel</button>
                  <button onClick={logout} disabled={loggingOut} className="btn-primary text-xs">
                    {loggingOut && <Loader2 className="h-4 w-4 animate-spin" />} Sign Out
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
