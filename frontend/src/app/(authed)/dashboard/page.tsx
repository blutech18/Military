"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Shield, ShieldCheck, ShieldAlert, Wrench, Clock, Users, BellRing, Crosshair, BarChart3, History, MapPinned,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtDate, PURPOSES, cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { useSidebarStore } from "@/store/sidebar";
import { DataError } from "@/components/ui/data-error";
import { AuditFeed } from "@/components/audit/audit-feed";

const LiveMap = dynamic(() => import("@/components/maps/live-map").then(m => m.LiveMap), { ssr: false, loading: () => (
  <div className="glass flex h-full min-h-[22rem] items-center justify-center rounded-xl text-steel-300">Loading tactical map…</div>
)});

const StatusPieChart = dynamic(
  () => import("@/components/dashboard-charts").then((m) => m.StatusPieChart),
  { ssr: false, loading: () => <div className="h-[190px] flex items-center justify-center text-steel-400 text-xs">Loading…</div> }
);

const ConditionBarChart = dynamic(
  () => import("@/components/dashboard-charts").then((m) => m.ConditionBarChart),
  { ssr: false, loading: () => <div className="h-[150px] flex items-center justify-center text-steel-400 text-xs">Loading…</div> }
);

// Shape returned by backend — varies by role.
interface DashboardSummary {
  role: string;
  kpi: Record<string, number>;
  by_condition?: Record<string, number>;
  by_status?: Record<string, number>;
  monthly_transactions?: { month: string; total: number }[];
  recent_transactions?: any[];
  recent_audit?: any[];
  recent_critical?: any[];
  maintenance_pipeline?: any[];
  overdue_items?: any[];
  today_transactions?: any[];
  my_transactions?: any[];
  my_assigned_ids?: number[];
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: async () => (await api.get<DashboardSummary>("/dashboard/summary")).data,
    refetchInterval: 30_000,
  });

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-olive-50">Dashboard</h1>
          <p className="text-sm text-steel-400">Real-time situational awareness across the 10RCDG armory.</p>
        </div>
        <DataError onRetry={refetch} />
      </div>
    );
  }

  const role = data?.role ?? user?.role ?? "";

  if (role === "Personnel") return <PersonnelDashboard data={data} isLoading={isLoading} userName={user?.full_name ?? ""} />;
  if (role === "Command Officer") return <CommandDashboard data={data} isLoading={isLoading} />;
  if (role === "Armory Custodian") return <CustodianDashboard data={data} isLoading={isLoading} />;
  if (role === "S4 Officer") return <S4Dashboard data={data} isLoading={isLoading} />;
  return <AdminDashboard data={data} isLoading={isLoading} />;
}

/* --------------------------- ADMINISTRATOR --------------------------- */
function AdminDashboard({ data, isLoading }: { data?: DashboardSummary; isLoading: boolean }) {
  const kpiTiles = [
    { label: "Total Firearms",  value: data?.kpi.total_firearms,      Icon: Shield,        tone: "text-olive-200" },
    { label: "Available",       value: data?.kpi.available,           Icon: ShieldCheck,   tone: "text-emerald-300" },
    { label: "Issued",          value: data?.kpi.checked_out,         Icon: Crosshair,     tone: "text-blue-300" },
    { label: "Maintenance",     value: data?.kpi.maintenance,         Icon: Wrench,        tone: "text-amber-300" },
    { label: "Overdue",         value: data?.kpi.overdue,             Icon: Clock,         tone: "text-red-300" },
    { label: "Personnel",       value: data?.kpi.total_personnel,     Icon: Users,         tone: "text-olive-200" },
    { label: "Active Tx",       value: data?.kpi.active_transactions, Icon: ShieldAlert,   tone: "text-cyan-300" },
    { label: "Critical Alerts", value: data?.kpi.critical_alerts,     Icon: BellRing,      tone: "text-red-300" },
  ];

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">
      <PageHeader
        title="System Administration"
        subtitle="Full oversight of the 10RCDG armory — users, inventory, security, and audit."
        isLoading={isLoading}
      />
      <KpiGrid tiles={kpiTiles} />
      <MapAndCharts data={data} />
      <RecentPanels data={data} />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Link href="/users" className="glass rounded-xl p-4 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">User Management</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Create, edit, or deactivate personnel accounts.</p>
        </Link>
        <Link href="/settings" className="glass rounded-xl p-4 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Security Settings</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">TOTP, biometric, and session policies.</p>
        </Link>
        <Link href="/audit" className="glass rounded-xl p-4 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Full Audit Log</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Immutable trail of every system action.</p>
        </Link>
        <Link href="/reports" className="glass rounded-xl p-4 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Reports</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Export inventory, GPS, and security reports.</p>
        </Link>
      </div>
    </div>
  );
}

/* --------------------------- COMMAND OFFICER --------------------------- */
function CommandDashboard({ data, isLoading }: { data?: DashboardSummary; isLoading: boolean }) {
  const readiness = data?.kpi.readiness_pct ?? 0;
  const kpiTiles = [
    { label: "Readiness",       value: readiness,                     Icon: ShieldCheck,   tone: readiness >= 80 ? "text-emerald-300" : "text-amber-300" },
    { label: "Total Firearms",  value: data?.kpi.total_firearms,      Icon: Shield,        tone: "text-olive-200" },
    { label: "Currently Issued",value: data?.kpi.checked_out,         Icon: Crosshair,     tone: "text-blue-300" },
    { label: "Overdue",         value: data?.kpi.overdue,             Icon: Clock,         tone: "text-red-300" },
    { label: "Personnel",       value: data?.kpi.total_personnel,     Icon: Users,         tone: "text-olive-200" },
    { label: "Critical Alerts", value: data?.kpi.critical_alerts,     Icon: BellRing,      tone: "text-red-300" },
  ];

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">
      <PageHeader
        title="Command Overview"
        subtitle="Strategic readiness, situational awareness, and security posture."
        isLoading={isLoading}
      />
      <KpiGrid tiles={kpiTiles} />

      {/* Map — full width for command situational awareness */}
      <div className="glass flex min-h-[24rem] flex-col rounded-xl p-4 sm:min-h-[30rem] lg:min-h-[clamp(32rem,62vh,44rem)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="section-title">Operational Map</p>
          <span className="pill pill-tactical">{data?.kpi.checked_out ?? 0} deployed</span>
        </div>
        <div className="relative min-h-[20rem] flex-1 overflow-hidden rounded-md">
          <LiveMap />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Critical alerts panel */}
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3 text-red-300">Critical Alerts</p>
          <ol className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
            {(!data?.recent_critical || data.recent_critical.length === 0) && (
              <li className="text-sm text-steel-500 text-center py-4">No critical alerts — systems nominal.</li>
            )}
            {data?.recent_critical?.map((n: any) => (
              <li key={n.notification_id} className="border-l-2 border-red-600/50 pl-3 py-1">
                <p className="text-xs text-red-200 font-semibold">{n.title}</p>
                <p className="text-xs text-steel-400 truncate">{n.message}</p>
                <p className="text-[10px] text-steel-500 mt-0.5">{fmtRelative(n.created_at)}</p>
              </li>
            ))}
          </ol>
        </div>

        {/* Audit feed */}
        <div className="glass rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="section-title">Security Audit Feed</p>
            <Link href="/audit" className="text-xs text-olive-400 hover:text-olive-300 transition">
              Full Trail →
            </Link>
          </div>
          <AuditFeed items={data?.recent_audit} maxHeight="max-h-[300px]" />
        </div>
      </div>

      {/* Charts — status distribution only, no transaction tables */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3">Fleet Status</p>
          <StatusPieChart data={data ? Object.entries(data.by_status ?? {}).map(([name, value]) => ({ name, value })) : []} />
        </div>
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3">Equipment Condition</p>
          <ConditionBarChart data={data ? Object.entries(data.by_condition ?? {}).map(([name, value]) => ({ name, value })) : []} />
        </div>
      </div>
    </div>
  );
}

/* --------------------------- S4 OFFICER --------------------------- */
function S4Dashboard({ data, isLoading }: { data?: DashboardSummary; isLoading: boolean }) {
  const kpiTiles = [
    { label: "Total Inventory", value: data?.kpi.total_firearms,      Icon: Shield,        tone: "text-olive-200" },
    { label: "Available",       value: data?.kpi.available,           Icon: ShieldCheck,   tone: "text-emerald-300" },
    { label: "Issued",          value: data?.kpi.checked_out,         Icon: Crosshair,     tone: "text-blue-300" },
    { label: "In Maintenance",  value: data?.kpi.maintenance,         Icon: Wrench,        tone: "text-amber-300" },
    { label: "Overdue Returns", value: data?.kpi.overdue,             Icon: Clock,         tone: "text-red-300" },
    { label: "Active Tx",       value: data?.kpi.active_transactions, Icon: ShieldAlert,   tone: "text-cyan-300" },
  ];

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">
      <PageHeader
        title="Logistics & Supply"
        subtitle="Inventory turnover, maintenance pipeline, and condition tracking."
        isLoading={isLoading}
      />
      <KpiGrid tiles={kpiTiles} />

      {/* Charts — condition focus for supply officer */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3">Status Distribution</p>
          <StatusPieChart data={data ? Object.entries(data.by_status ?? {}).map(([name, value]) => ({ name, value })) : []} />
        </div>
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3">Condition Breakdown</p>
          <ConditionBarChart data={data ? Object.entries(data.by_condition ?? {}).map(([name, value]) => ({ name, value })) : []} />
        </div>

        {/* Maintenance pipeline */}
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3">Maintenance Pipeline</p>
          <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
            {(!data?.maintenance_pipeline || data.maintenance_pipeline.length === 0) && (
              <p className="text-sm text-steel-500 text-center py-4">No pending maintenance.</p>
            )}
            {data?.maintenance_pipeline?.map((m: any) => (
              <div key={m.maintenance_id} className="border-l-2 border-amber-500/40 pl-3 py-1">
                <p className="text-xs text-olive-100 font-mono">{m.firearm?.serial_number ?? "—"}</p>
                <p className="text-xs text-steel-400">{m.maintenance_type} · due {fmtDate(m.next_schedule)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Overdue items — critical supply-chain concern */}
      {(data?.overdue_items?.length ?? 0) > 0 && (
        <div className="glass rounded-xl p-4 border-red-700/30 border">
          <p className="section-title mb-3 text-red-300">Overdue Returns</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-olive-300">
                <tr><th className="text-left py-1">Firearm</th><th className="text-center">Personnel</th><th className="text-center">Expected Return</th></tr>
              </thead>
              <tbody>
                {data?.overdue_items?.map((t: any) => (
                  <tr key={t.transaction_id} className="border-t border-steel-800">
                    <td className="py-1.5 text-olive-100 font-mono text-xs">{t.firearm?.serial_number}</td>
                    <td className="text-center text-steel-300 text-xs">{t.user?.rank} {t.user?.first_name} {t.user?.last_name}</td>
                    <td className="text-center text-red-300 text-xs">{fmtDate(t.expected_return_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent transactions */}
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="section-title">Recent Transactions</p>
          <Link href="/transactions" className="btn-ghost text-xs text-olive-300">View all</Link>
        </div>
        <RecentTxTable rows={data?.recent_transactions ?? []} />
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/firearms" className="glass rounded-xl p-4 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Inventory</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Manage the full firearm inventory.</p>
        </Link>
        <Link href="/maintenance" className="glass rounded-xl p-4 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <Wrench className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Maintenance</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Schedule and track maintenance cycles.</p>
        </Link>
        <Link href="/reports" className="glass rounded-xl p-4 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Reports</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Export inventory and GPS history.</p>
        </Link>
      </div>
    </div>
  );
}

/* --------------------------- ARMORY CUSTODIAN --------------------------- */
function CustodianDashboard({ data, isLoading }: { data?: DashboardSummary; isLoading: boolean }) {
  const kpiTiles = [
    { label: "On Rack",         value: data?.kpi.available,           Icon: ShieldCheck,   tone: "text-emerald-300" },
    { label: "Issued Out",      value: data?.kpi.checked_out,         Icon: Crosshair,     tone: "text-blue-300" },
    { label: "Maintenance",     value: data?.kpi.maintenance,         Icon: Wrench,        tone: "text-amber-300" },
    { label: "Overdue",         value: data?.kpi.overdue,             Icon: Clock,         tone: "text-red-300" },
    { label: "Today's Tx",      value: data?.today_transactions?.length, Icon: ShieldAlert, tone: "text-cyan-300" },
  ];

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">
      <PageHeader
        title="Armory Operations"
        subtitle="Day-to-day rack status, issue/return activity, and overdue tracking."
        isLoading={isLoading}
      />
      <KpiGrid tiles={kpiTiles} />

      {/* Map — smaller, operational scope */}
      <div className="glass flex min-h-[22rem] flex-col rounded-xl p-4 sm:min-h-[27rem] lg:min-h-[clamp(28rem,52vh,36rem)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="section-title">Active GPS Tracking</p>
          <span className="pill pill-tactical">{data?.kpi.checked_out ?? 0} in field</span>
        </div>
        <div className="relative min-h-[18rem] flex-1 overflow-hidden rounded-md">
          <LiveMap />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Today's activity */}
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3">Today&apos;s Activity</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-olive-300">
                <tr><th className="text-left py-1">Firearm</th><th className="text-center">Personnel</th><th className="text-center">Time</th><th className="text-center">Status</th></tr>
              </thead>
              <tbody>
                {(!data?.today_transactions || data.today_transactions.length === 0) && (
                  <tr><td colSpan={4} className="text-center py-6 text-steel-500 text-xs">No activity today yet.</td></tr>
                )}
                {data?.today_transactions?.map((t: any) => (
                  <tr key={t.transaction_id} className="border-t border-steel-800">
                    <td className="py-1.5 text-olive-100 font-mono text-xs">{t.firearm?.serial_number}</td>
                    <td className="text-center text-steel-300 text-xs">{t.user?.first_name} {t.user?.last_name}</td>
                    <td className="text-center text-steel-400 text-xs">{fmtRelative(t.checkout_at)}</td>
                    <td className="text-center"><span className={`pill pill-${t.status === "Active" ? "info" : t.status === "Overdue" ? "critical" : "ok"}`}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Overdue panel */}
        <div className="glass rounded-xl p-4 border-red-700/20 border">
          <p className="section-title mb-3 text-red-300">Overdue Returns</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-olive-300">
                <tr><th className="text-left py-1">Firearm</th><th className="text-center">Personnel</th><th className="text-center">Expected</th></tr>
              </thead>
              <tbody>
                {(!data?.overdue_items || data.overdue_items.length === 0) && (
                  <tr><td colSpan={3} className="text-center py-6 text-steel-500 text-xs">No overdue items.</td></tr>
                )}
                {data?.overdue_items?.map((t: any) => (
                  <tr key={t.transaction_id} className="border-t border-steel-800">
                    <td className="py-1.5 text-olive-100 font-mono text-xs">{t.firearm?.serial_number}</td>
                    <td className="text-center text-steel-300 text-xs">{t.user?.rank} {t.user?.first_name} {t.user?.last_name}</td>
                    <td className="text-center text-red-300 text-xs">{fmtDate(t.expected_return_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/transactions/new" className="glass rounded-xl p-4 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Issue Firearm</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Start a new issuance transaction.</p>
        </Link>
        <Link href="/scan" className="glass rounded-xl p-4 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Scan & Return</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Scan QR to process a return.</p>
        </Link>
        <Link href="/firearms" className="glass rounded-xl p-4 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Full Inventory</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Browse all firearms and their status.</p>
        </Link>
      </div>
    </div>
  );
}

/* --------------------------- PERSONNEL --------------------------- */
function PersonnelDashboard({ data, isLoading, userName }: { data?: DashboardSummary; isLoading: boolean; userName: string }) {
  const kpiTiles = [
    { label: "Assigned to Me",  value: data?.kpi.my_assigned,        Icon: Shield,       tone: "text-olive-200" },
    { label: "Active",          value: data?.kpi.my_active_tx,       Icon: ShieldCheck,  tone: "text-emerald-300" },
    { label: "Overdue",         value: data?.kpi.my_overdue,         Icon: Clock,        tone: "text-red-300" },
    { label: "History",         value: data?.kpi.my_total_history,   Icon: History,      tone: "text-steel-200" },
    { label: "My Alerts",       value: data?.kpi.my_alerts,          Icon: BellRing,     tone: "text-amber-300" },
  ];

  return (
    <div className="space-y-6 w-full min-w-0 max-w-full">
      <PageHeader
        title={`Welcome, ${userName}`}
        subtitle="Your firearm assignments and transaction history."
        isLoading={isLoading}
      />
      <KpiGrid tiles={kpiTiles} />

      {/* Charts — armory-wide aggregate stats */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3">Armory Status Distribution</p>
          <StatusPieChart data={data ? Object.entries(data.by_status ?? {}).map(([name, value]) => ({ name, value })) : []} />
        </div>
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3">Armory Condition</p>
          <ConditionBarChart data={data ? Object.entries(data.by_condition ?? {}).map(([name, value]) => ({ name, value })) : []} />
        </div>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="section-title">My Transactions</p>
          <Link href="/transactions" className="btn-ghost text-xs text-olive-300">View all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-olive-300">
              <tr>
                <th className="text-left py-1">Firearm</th>
                <th className="text-center">Purpose</th>
                <th className="text-center">Checked Out</th>
                <th className="text-center">Returned</th>
                <th className="text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {(!data?.my_transactions || data.my_transactions.length === 0) && (
                <tr><td colSpan={5} className="text-center py-6 text-steel-500 text-xs">No transactions yet.</td></tr>
              )}
              {data?.my_transactions?.map((t: any) => (
                <tr key={t.transaction_id} className="border-t border-steel-800">
                  <td className="py-1.5 font-mono text-olive-100 text-xs">
                    {t.firearm?.serial_number} <span className="text-steel-500">· {t.firearm?.model}</span>
                  </td>
                  <td className="text-center text-xs">{PURPOSES[t.purpose] ?? "—"}</td>
                  <td className="text-center text-xs text-steel-400">{fmtDate(t.checkout_at)}</td>
                  <td className="text-center text-xs text-steel-400">{t.actual_return_at ? fmtDate(t.actual_return_at) : "—"}</td>
                  <td className="text-center"><span className={`pill pill-${t.status === "Active" ? "info" : t.status === "Overdue" ? "critical" : t.status === "Returned" ? "ok" : "muted"}`}>{t.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Link href="/scan" className="glass rounded-xl p-5 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Scan to Return</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Scan a firearm's QR code to complete a return.</p>
        </Link>
        <Link href="/firearms" className="glass rounded-xl p-5 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <Shield className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">My Firearms</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">View details of firearms assigned to you.</p>
        </Link>
        <Link href="/notifications" className="glass rounded-xl p-5 hover:border-olive-600/40 transition border border-transparent group">
          <div className="flex items-center gap-2">
            <BellRing className="h-4 w-4 text-olive-300 shrink-0 group-hover:text-olive-200 transition-colors" />
            <p className="font-semibold text-olive-100 text-sm">Alerts</p>
          </div>
          <p className="text-xs text-steel-400 mt-1.5">Review notifications and overdue reminders.</p>
        </Link>
      </div>
    </div>
  );
}

/* --------------------------- SHARED HELPERS --------------------------- */

function PageHeader({ title, subtitle, isLoading }: { title: string; subtitle: string; isLoading: boolean }) {
  return (
    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2">
      <div>
        <h1 className="text-2xl font-bold text-olive-50">{title}</h1>
        <p className="text-sm text-steel-400">{subtitle}</p>
      </div>
      {isLoading && (
        <p className="text-[11px] uppercase tracking-widest text-olive-400">Synchronizing…</p>
      )}
    </div>
  );
}

function KpiGrid({ tiles }: { tiles: { label: string; value: number | undefined; Icon: any; tone: string }[] }) {
  const isCollapsed = useSidebarStore((s) => s.isCollapsed);

  // Responsive fallback classes conditioned on whether sidebar is open or collapsed
  const fallbackCols =
    tiles.length <= 5
      ? isCollapsed
        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
        : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-5"
      : tiles.length <= 6
      ? isCollapsed
        ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-6"
        : "grid-cols-2 sm:grid-cols-3 xl:grid-cols-6"
      : isCollapsed
      ? "grid-cols-2 sm:grid-cols-4 xl:grid-cols-8"
      : "grid-cols-2 sm:grid-cols-4 2xl:grid-cols-8";

  const containerQueryClass =
    tiles.length <= 5 ? "kpi-grid-5" : tiles.length <= 6 ? "kpi-grid-6" : "kpi-grid-8";

  return (
    <div className="kpi-container w-full min-w-0">
      <div className={cn("kpi-grid", containerQueryClass, fallbackCols)}>
        {tiles.map((t, i) => (
          <motion.div
            key={t.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className="kpi-tile min-w-0"
          >
            <div className="flex items-start justify-between gap-2 mb-2 min-w-0">
              <t.Icon className={cn("h-4 w-4 shrink-0 mt-0.5", t.tone)} />
              <span
                className="text-[10px] uppercase tracking-wider text-steel-400 font-medium text-right leading-tight min-w-0 break-words line-clamp-2"
                title={t.label}
              >
                {t.label}
              </span>
            </div>
            <p className="text-2xl font-bold text-olive-50 tabular-nums">{t.value ?? "—"}</p>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function MapAndCharts({ data }: { data?: DashboardSummary }) {
  const conditionData = data ? Object.entries(data.by_condition ?? {}).map(([name, value]) => ({ name, value })) : [];
  const statusData    = data ? Object.entries(data.by_status ?? {}).map(([name, value]) => ({ name, value })) : [];

  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-3">
      <div className="glass flex min-h-[28rem] flex-col rounded-xl p-4 sm:min-h-[34rem] lg:col-span-2 lg:min-h-[clamp(36rem,68vh,48rem)]">
        <div className="mb-3 flex items-center justify-between">
          <p className="section-title">Live Tactical Map</p>
          <span className="pill pill-tactical">{data?.kpi.checked_out ?? 0} active</span>
        </div>
        <div className="relative min-h-[22rem] flex-1 overflow-hidden rounded-md">
          <LiveMap />
        </div>
      </div>

      <div className="space-y-4">
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3">Status Distribution</p>
          <StatusPieChart data={statusData} />
        </div>
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3">Condition</p>
          <ConditionBarChart data={conditionData} />
        </div>
      </div>
    </div>
  );
}

function RecentPanels({ data }: { data?: DashboardSummary }) {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      <div className="glass rounded-xl p-4">
        <p className="section-title mb-3">Recent Transactions</p>
        <RecentTxTable rows={data?.recent_transactions ?? []} />
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="section-title">Live Audit Feed</p>
          <Link href="/audit" className="text-xs text-olive-400 hover:text-olive-300 transition">
            Full Trail →
          </Link>
        </div>
        <AuditFeed items={data?.recent_audit} maxHeight="max-h-[320px]" />
      </div>
    </div>
  );
}

function RecentTxTable({ rows }: { rows: any[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[10px] uppercase tracking-widest text-olive-300">
          <tr><th className="text-left py-1">Firearm</th><th className="text-center">Personnel</th><th className="text-center">When</th><th className="text-center">Status</th></tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={4} className="text-center py-6 text-steel-500 text-xs">No recent transactions.</td></tr>
          )}
          {rows.map((t: any) => (
            <tr key={t.transaction_id} className="border-t border-steel-800">
              <td className="py-1.5 text-olive-100 font-mono text-xs">{t.firearm?.serial_number}</td>
              <td className="text-center text-steel-300">{t.user?.first_name} {t.user?.last_name}</td>
              <td className="text-center text-steel-400 text-xs">{fmtRelative(t.checkout_at)}</td>
              <td className="text-center"><span className={`pill pill-${t.status === "Active" ? "info" : t.status === "Overdue" ? "critical" : "ok"}`}>{t.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
