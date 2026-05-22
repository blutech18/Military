"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/utils";
import { Lock, ChevronLeft, ChevronRight } from "lucide-react";
import { DataError } from "@/components/ui/data-error";

export default function AuditPage() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);

  const { data: actions } = useQuery({
    queryKey: ["audit-actions"],
    queryFn: async () => (await api.get<string[]>("/audit-logs/actions")).data,
  });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["audit-logs", action, page],
    queryFn: async () => (await api.get("/audit-logs", { params: { action: action || undefined, page, per_page: 15 } })).data,
  });

  function handleActionChange(newAction: string) {
    setAction(newAction);
    setPage(1);
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-olive-50 flex items-center gap-2"><Lock className="h-5 w-5 text-olive-300" /> Audit Trail</h1>
        <p className="text-sm text-steel-400">Immutable log of every privileged action. Standard users cannot edit or delete.</p>
      </div>

      <div className="glass rounded-xl p-4 flex flex-col min-h-[500px]">
        <div className="mb-3 flex gap-2">
          <select className="input-field max-w-xs" value={action} onChange={(e) => handleActionChange(e.target.value)}>
            <option value="">All actions</option>
            {actions?.map((a: string) => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-olive-300">
                <th className="text-left py-2">Time</th>
                <th className="text-center">Actor</th>
                <th className="text-center">Role</th>
                <th className="text-center">Action</th>
                <th className="text-center">Description</th>
                <th className="text-center">IP</th>
                <th className="text-center">Firearm</th>
              </tr>
            </thead>
            <tbody>
              {isError && <tr><td colSpan={7} className="py-0"><DataError onRetry={refetch} /></td></tr>}
              {isLoading && !isError && <tr><td colSpan={7} className="text-center py-8 text-steel-400">Loading…</td></tr>}
              {!isLoading && data?.data?.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-steel-500">No audit logs found.</td></tr>
              )}
              {data?.data?.map((row: any) => (
                <tr key={row.log_id} className="border-t border-steel-800/50 hover:bg-steel-800/20 transition-colors">
                  <td className="text-xs text-steel-300 py-2.5 font-mono">{fmtDate(row.created_at)}</td>
                  <td className="text-center text-olive-100 text-xs">{row.user?.username ?? "system"}</td>
                  <td className="text-center text-xs text-steel-400">{row.role ?? "—"}</td>
                  <td className="text-center"><span className="pill pill-tactical">{row.action}</span></td>
                  <td className="text-center text-xs text-steel-200 max-w-md truncate">{row.description}</td>
                  <td className="text-center font-mono text-xs text-steel-500">{row.ip_address}</td>
                  <td className="text-center font-mono text-xs text-steel-400">{row.firearm?.serial_number ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {data && data.last_page > 1 && (
          <div className="mt-4 flex items-center justify-between border-t border-steel-800/50 pt-4">
            <div className="text-xs text-steel-400">
              Showing <span className="font-medium text-steel-200">{data.from || 0}</span> to <span className="font-medium text-steel-200">{data.to || 0}</span> of <span className="font-medium text-steel-200">{data.total}</span> entries
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1 || isLoading}
                className="btn-ghost p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-steel-400 font-mono">
                Page {page} / {data.last_page}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.last_page, p + 1))}
                disabled={page === data.last_page || isLoading}
                className="btn-ghost p-1.5 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
