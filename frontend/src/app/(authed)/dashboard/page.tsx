"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import {
  Shield, ShieldCheck, ShieldAlert, Wrench, Clock, Users, BellRing, Crosshair, BarChart3, History, MapPinned,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtRelative, fmtDate, PURPOSES } from "@/lib/utils";
import { useAuthStore } from "@/store/auth";
import { DataError } from "@/components/ui/data-error";

const LiveMap = dynamic(() => import("@/components/maps/live-map").then(m => m.LiveMap), { ssr: false, loading: () => (
  <div className="glass rounded-xl h-[420px] flex items-center justify-center text-steel-300">Loading tactical map…</div>
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

/* ─────────────────────────── ADMINISTRATOR ─────────────────────────── */
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
    <div className="space-y-6">
      <PageHeader
        title="Command Dashboard"
        subtitle="Real-time situational awareness across the 10RCDG armory."
        isLoading={isLoading}
      />
      <KpiGrid tiles={kpiTiles} />
      <MapAndCharts data={data} />
      <RecentPanels data={data} />
    </div>
  );
}

/* ─────────────────────────── COMMAND OFFICER ─────────────────────────── */
function CommandDashboard({ data, isLoading }: { data?: DashboardSummary; isLoading: boolean }) {
  const kpiTiles = [
    { label: "Total Firearms",  value: data?.kpi.total_firearms,      Icon: Shield,        tone: "text-olive-200" },
    { label: "Available",       value: data?.kpi.available,           Icon: ShieldCheck,   tone: "text-emerald-300" },
    { label: "Currently Issued",value: data?.kpi.checked_out,         Icon: Crosshair,     tone: "text-blue-300" },
    { label: "Overdue",         value: data?.kpi.overdue,             Icon: Clock,         tone: "text-red-300" },
    { label: "Personnel",       value: data?.kpi.total_personnel,     Icon: Users,         tone: "text-olive-200" },
    { label: "Critical Alerts", value: data?.kpi.critical_alerts,     Icon: BellRing,      tone: "text-red-300" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Command Overview"
        subtitle="Strategic readiness snapshot — distribution, alerts, and historical patterns."
        isLoading={isLoading}
      />
      <KpiGrid tiles={kpiTiles} />
      <MapAndCharts data={data} />
      <div className="glass rounded-xl p-4">
        <p className="section-title mb-3">Live Audit Feed</p>
        <ol className="space-y-2 max-h-[320px] overflow-y-auto pr-2">
          {data?.recent_audit?.map((a: any) => (
            <li key={a.log_id} className="border-l-2 border-olive-600/40 pl-3 py-1">
              <p className="text-xs text-olive-200 font-semibold flex justify-between">
                <span>{a.action}</span>
                <span className="text-steel-500">{fmtRelative(a.created_at)}</span>
              </p>
              <p className="text-xs text-steel-400 truncate">{a.description}</p>
              <p className="text-[10px] text-steel-500 mt-0.5">{a.user?.username ?? "system"} · {a.ip_address}</p>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/* ─────────────────────────── S4 OFFICER ─────────────────────────── */
function S4Dashboard({ data, isLoading }: { data?: DashboardSummary; isLoading: boolean }) {
  const kpiTiles = [
    { label: "Total Firearms",  value: data?.kpi.total_firearms,      Icon: Shield,        tone: "text-olive-200" },
    { label: "Available",       value: data?.kpi.available,           Icon: ShieldCheck,   tone: "text-emerald-300" },
    { label: "Issued",          value: data?.kpi.checked_out,         Icon: Crosshair,     tone: "text-blue-300" },
    { label: "Maintenance",     value: data?.kpi.maintenance,         Icon: Wrench,        tone: "text-amber-300" },
    { label: "Overdue",         value: data?.kpi.overdue,             Icon: Clock,         tone: "text-red-300" },
    { label: "Active Tx",       value: data?.kpi.active_transactions, Icon: ShieldAlert,   tone: "text-cyan-300" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Logistics Dashboard"
        subtitle="Inventory and transaction visibility for S4 Officer."
        isLoading={isLoading}
      />
      <KpiGrid tiles={kpiTiles} />
      <MapAndCharts data={data} />
      <RecentPanels data={data} />
    </div>
  );
}

/* ─────────────────────────── ARMORY CUSTODIAN ─────────────────────────── */
function CustodianDashboard({ data, isLoading }: { data?: DashboardSummary; isLoading: boolean }) {
  const kpiTiles = [
    { label: "Available",       value: data?.kpi.available,           Icon: ShieldCheck,   tone: "text-emerald-300" },
    { label: "Issued",          value: data?.kpi.checked_out,         Icon: Crosshair,     tone: "text-blue-300" },
    { label: "Maintenance",     value: data?.kpi.maintenance,         Icon: Wrench,        tone: "text-amber-300" },
    { label: "Overdue",         value: data?.kpi.overdue,             Icon: Clock,         tone: "text-red-300" },
    { label: "Active Tx",       value: data?.kpi.active_transactions, Icon: ShieldAlert,   tone: "text-cyan-300" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Armory Operations"
        subtitle="Day-to-day armory status and recent transactions."
        isLoading={isLoading}
      />
      <KpiGrid tiles={kpiTiles} />
      <MapAndCharts data={data} />

      <div className="glass rounded-xl p-4">
        <p className="section-title mb-3">Recent Transactions</p>
        <RecentTxTable rows={data?.recent_transactions ?? []} />
      </div>
    </div>
  );
}

/* ─────────────────────────── PERSONNEL ─────────────────────────── */
function PersonnelDashboard({ data, isLoading, userName }: { data?: DashboardSummary; isLoading: boolean; userName: string }) {
  const kpiTiles = [
    { label: "Assigned to Me",  value: data?.kpi.my_assigned,        Icon: Shield,       tone: "text-olive-200" },
    { label: "Active",          value: data?.kpi.my_active_tx,       Icon: ShieldCheck,  tone: "text-emerald-300" },
    { label: "Overdue",         value: data?.kpi.my_overdue,         Icon: Clock,        tone: "text-red-300" },
    { label: "History",         value: data?.kpi.my_total_history,   Icon: History,      tone: "text-steel-200" },
    { label: "My Alerts",       value: data?.kpi.my_alerts,          Icon: BellRing,     tone: "text-amber-300" },
  ];

  return (
    <div className="space-y-6">
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

      <div className="grid md:grid-cols-3 gap-3">
        <Link href="/scan" className="glass rounded-xl p-5 hover:border-olive-600/40 transition border border-transparent">
          <Crosshair className="h-5 w-5 text-olive-300 mb-2" />
          <p className="font-semibold text-olive-100 text-sm">Scan to Return</p>
          <p className="text-xs text-steel-400 mt-1">Scan a firearm's QR code to complete a return.</p>
        </Link>
        <Link href="/firearms" className="glass rounded-xl p-5 hover:border-olive-600/40 transition border border-transparent">
          <Shield className="h-5 w-5 text-olive-300 mb-2" />
          <p className="font-semibold text-olive-100 text-sm">My Firearms</p>
          <p className="text-xs text-steel-400 mt-1">View details of firearms assigned to you.</p>
        </Link>
        <Link href="/notifications" className="glass rounded-xl p-5 hover:border-olive-600/40 transition border border-transparent">
          <BellRing className="h-5 w-5 text-olive-300 mb-2" />
          <p className="font-semibold text-olive-100 text-sm">Alerts</p>
          <p className="text-xs text-steel-400 mt-1">Review notifications and overdue reminders.</p>
        </Link>
      </div>
    </div>
  );
}

/* ─────────────────────────── SHARED HELPERS ─────────────────────────── */

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
  const cols = tiles.length <= 5 ? "md:grid-cols-5" : tiles.length <= 6 ? "md:grid-cols-6" : "md:grid-cols-4 xl:grid-cols-8";
  return (
    <div className={`grid grid-cols-2 gap-3 ${cols}`}>
      {tiles.map((t, i) => (
        <motion.div
          key={t.label}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.04 }}
          className="kpi-tile"
        >
          <div className="flex items-center justify-between mb-2">
            <t.Icon className={`h-4 w-4 ${t.tone}`} />
            <span className="text-[10px] uppercase tracking-widest text-steel-400">{t.label}</span>
          </div>
          <p className="text-2xl font-bold text-olive-50 tabular-nums">{t.value ?? "—"}</p>
        </motion.div>
      ))}
    </div>
  );
}

function MapAndCharts({ data }: { data?: DashboardSummary }) {
  const conditionData = data ? Object.entries(data.by_condition ?? {}).map(([name, value]) => ({ name, value })) : [];
  const statusData    = data ? Object.entries(data.by_status ?? {}).map(([name, value]) => ({ name, value })) : [];

  return (
    <div className="grid lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 glass rounded-xl p-4">
        <div className="flex justify-between items-center mb-3">
          <p className="section-title">Live Tactical Map</p>
          <span className="pill pill-tactical">{data?.kpi.checked_out ?? 0} active</span>
        </div>
        <div className="h-[420px] rounded-md overflow-hidden">
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
        <p className="section-title mb-3">Live Audit Feed</p>
        <ol className="space-y-2 max-h-[320px] overflow-y-auto pr-2">
          {data?.recent_audit?.map((a: any) => (
            <li key={a.log_id} className="border-l-2 border-olive-600/40 pl-3 py-1">
              <p className="text-xs text-olive-200 font-semibold flex justify-between">
                <span>{a.action}</span>
                <span className="text-steel-500">{fmtRelative(a.created_at)}</span>
              </p>
              <p className="text-xs text-steel-400 truncate">{a.description}</p>
              <p className="text-[10px] text-steel-500 mt-0.5">{a.user?.username ?? "system"} · {a.ip_address}</p>
            </li>
          ))}
        </ol>
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
