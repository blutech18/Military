"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, RotateCcw, AlertCircle, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtDate, fmtRelative, PURPOSES } from "@/lib/utils";
import { useAuthStore, hasRole } from "@/store/auth";
import { DataError } from "@/components/ui/data-error";
import { ActionModal } from "@/components/ui/action-modal";

export default function TransactionsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const canAct = hasRole(user, "Administrator", "S4 Officer", "Armory Custodian");
  const [status, setStatus] = useState("");
  const [returnTarget, setReturnTarget] = useState<any | null>(null);
  const [returnCondition, setReturnCondition] = useState(2);
  const [showIssuance, setShowIssuance] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["transactions", status],
    queryFn: async () => (await api.get("/transactions", { params: { status: status || undefined, per_page: 50 } })).data,
  });

  const ret = useMutation({
    mutationFn: ({ id, condition }: { id: number; condition: number }) =>
      api.patch(`/transactions/${id}/return`, { condition_on_return: condition, notes: "Returned via UI" }),
    onSuccess: () => {
      toast.success("Firearm returned & GPS deactivated.");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Return failed."),
  });

  const sweep = useMutation({
    mutationFn: () => api.post("/transactions/sweep-overdue"),
    onSuccess: ({ data }) => {
      toast.success(`Flagged ${data.flagged} overdue.`);
      qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-olive-50">Transactions</h1>
        </div>
        <div className="flex gap-2">
          {canAct && (
            <>
              <button onClick={() => sweep.mutate()} className="btn-secondary text-xs">
                <AlertCircle className="h-4 w-4" /> Sweep Overdue
              </button>
              <button onClick={() => setShowIssuance(true)} className="btn-primary"><Plus className="h-4 w-4" /> New Issuance</button>
            </>
          )}
        </div>
      </div>

      <div className="glass rounded-xl p-4">
        <div className="flex gap-3 mb-3">
          <select className="input-field w-48" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="Active">Active</option>
            <option value="Returned">Returned</option>
            <option value="Overdue">Overdue</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-olive-300">
                <th className="text-left py-2">#</th>
                <th className="text-center">Firearm</th>
                <th className="text-center">Personnel</th>
                <th className="text-center">Authorized By</th>
                <th className="text-center">Purpose</th>
                <th className="text-center">Checkout</th>
                <th className="text-center">Expected</th>
                <th className="text-center">Returned</th>
                <th className="text-center">Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isError && <tr><td colSpan={10} className="py-0"><DataError onRetry={refetch} /></td></tr>}
              {isLoading && !isError && <tr><td colSpan={10} className="text-center py-6 text-steel-400">Loading…</td></tr>}
              {data?.data?.map((t: any) => (
                <tr key={t.transaction_id} className="border-t border-steel-800 hover:bg-steel-800/30">
                  <td className="py-1.5 font-mono text-olive-200">#{t.transaction_id}</td>
                  <td className="text-center font-mono text-xs text-olive-100">{t.firearm?.serial_number} <span className="text-steel-500">· {t.firearm?.model}</span></td>
                  <td className="text-center text-steel-200">{t.user?.first_name} {t.user?.last_name}</td>
                  <td className="text-center text-steel-400 text-xs">{t.authorizer?.first_name} {t.authorizer?.last_name}</td>
                  <td className="text-center text-xs">{PURPOSES[t.purpose]}</td>
                  <td className="text-center text-xs text-steel-400">{fmtDate(t.checkout_at)}</td>
                  <td className="text-center text-xs text-steel-400">{fmtDate(t.expected_return_at)}</td>
                  <td className="text-center text-xs text-steel-400">{t.actual_return_at ? fmtRelative(t.actual_return_at) : "—"}</td>
                  <td className="text-center"><span className={`pill pill-${t.status === "Active" ? "info" : t.status === "Overdue" ? "critical" : t.status === "Returned" ? "ok" : "muted"}`}>{t.status}</span></td>
                  <td className="text-center">
                    {canAct && (t.status === "Active" || t.status === "Overdue") && (
                      <button
                        className="btn-ghost text-xs"
                        onClick={() => { setReturnTarget(t); setReturnCondition(2); }}
                      >
                        <RotateCcw className="h-3.5 w-3.5" /> Return
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {data?.data?.length === 0 && !isLoading && <tr><td colSpan={10} className="text-center py-6 text-steel-500">No transactions.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <ActionModal
        open={returnTarget !== null}
        onClose={() => setReturnTarget(null)}
        onConfirm={() => {
          if (returnTarget) {
            ret.mutate({ id: returnTarget.transaction_id, condition: returnCondition });
            setReturnTarget(null);
          }
        }}
        title="Return Firearm"
        description={`Confirm the return of firearm ${returnTarget?.firearm?.serial_number ?? ""} issued to ${returnTarget?.user?.first_name ?? ""} ${returnTarget?.user?.last_name ?? ""}.`}
        confirmLabel="Confirm Return"
        confirmVariant="primary"
      >
        <div className="space-y-3">
          {/* Transaction Details */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-olive-300 mb-2">Transaction Details</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-steel-400">Transaction #</span>
                <p className="text-olive-100 font-mono">{returnTarget?.transaction_id}</p>
              </div>
              <div>
                <span className="text-steel-400">Firearm</span>
                <p className="text-olive-100 font-mono">{returnTarget?.firearm?.serial_number}</p>
              </div>
              <div>
                <span className="text-steel-400">Model</span>
                <p className="text-olive-100">{returnTarget?.firearm?.model}</p>
              </div>
              <div>
                <span className="text-steel-400">Personnel</span>
                <p className="text-olive-100">{returnTarget?.user?.first_name} {returnTarget?.user?.last_name}</p>
              </div>
            </div>
          </div>

          {/* Condition Selection */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-olive-300 mb-2">Condition on Return</p>
            <label className="text-xs text-steel-400 mb-1 block">Select the firearm's condition</label>
            <select
              value={returnCondition}
              onChange={(e) => setReturnCondition(Number(e.target.value))}
              className="input-field w-full"
            >
              <option value={1}>Excellent</option>
              <option value={2}>Good</option>
              <option value={3}>Fair</option>
              <option value={4}>Poor</option>
            </select>
          </div>
        </div>
      </ActionModal>

      {/* New Issuance Modal */}
      {showIssuance && <IssuanceModal onClose={() => setShowIssuance(false)} onSuccess={() => {
        setShowIssuance(false);
        qc.invalidateQueries({ queryKey: ["transactions"] });
        qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      }} />}
    </div>
  );
}

/* ────────────── Issuance Modal ────────────── */
function IssuanceModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    equipment_id: "",
    user_id: "",
    expected_return_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 16),
    purpose: 1,
    condition_on_issue: 2,
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  const { data: firearms } = useQuery({
    queryKey: ["available-firearms"],
    queryFn: async () => (await api.get("/firearms", { params: { availability_status: 1, per_page: 100 } })).data,
  });

  const { data: personnel } = useQuery({
    queryKey: ["personnel-for-issue"],
    queryFn: async () => (await api.get("/users", { params: { only_active: 1, per_page: 100 } })).data,
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post("/transactions/issue", {
        ...form,
        equipment_id: Number(form.equipment_id),
        user_id: Number(form.user_id),
      });
      toast.success("Firearm issued — GPS tracking activated.");
      onSuccess();
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Issuance failed.");
    } finally {
      setLoading(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="glass rounded-xl p-5 w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex justify-between items-center">
            <p className="section-title">New Issuance</p>
            <button type="button" onClick={onClose} className="btn-ghost text-xs"><X className="h-3.5 w-3.5" /></button>
          </div>
          <p className="text-xs text-steel-400">After approval, GPS tracking and audit logging are activated automatically.</p>

          {/* Firearm & Personnel */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-olive-300 mb-1.5">Assignment</p>
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-steel-400 mb-1 block">Firearm <span className="text-red-400">*</span></label>
                <select className="input-field w-full" required value={form.equipment_id} onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}>
                  <option value="">— Select firearm —</option>
                  {firearms?.data?.map((f: any) => (
                    <option key={f.equipment_id} value={f.equipment_id}>
                      {f.serial_number} · {f.model}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs text-steel-400 mb-1 block">Personnel <span className="text-red-400">*</span></label>
                <select className="input-field w-full" required value={form.user_id} onChange={(e) => setForm({ ...form, user_id: e.target.value })}>
                  <option value="">— Select personnel —</option>
                  {personnel?.data?.map((u: any) => (
                    <option key={u.user_id} value={u.user_id}>{u.rank} {u.first_name} {u.last_name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Details */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-olive-300 mb-1.5">Details</p>
            <div className="grid md:grid-cols-[2fr_1fr_1fr] gap-3">
              <div>
                <label className="text-xs text-steel-400 mb-1 block">Expected Return <span className="text-red-400">*</span></label>
                <input className="input-field w-full h-[42px]" type="datetime-local" required value={form.expected_return_at}
                       onChange={(e) => setForm({ ...form, expected_return_at: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-steel-400 mb-1 block">Purpose <span className="text-red-400">*</span></label>
                <select className="input-field w-full h-[42px]" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: Number(e.target.value) })}>
                  <option value={1}>Training</option>
                  <option value={2}>Operation</option>
                  <option value={3}>Maintenance</option>
                  <option value={4}>Inspection</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-steel-400 mb-1 block">Condition <span className="text-red-400">*</span></label>
                <select className="input-field w-full h-[42px]" value={form.condition_on_issue} onChange={(e) => setForm({ ...form, condition_on_issue: Number(e.target.value) })}>
                  <option value={1}>Excellent</option>
                  <option value={2}>Good</option>
                  <option value={3}>Fair</option>
                  <option value={4}>Poor</option>
                </select>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs text-steel-400 mb-1 block">Notes</label>
            <textarea className="input-field w-full h-16" placeholder="Optional notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-steel-800">
            <button type="button" onClick={onClose} className="btn-secondary text-xs">Cancel</button>
            <button disabled={loading} className="btn-primary text-xs">
              {loading && <Loader2 className="h-4 w-4 animate-spin" />} Authorize Issuance
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
