"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Wrench, Loader2, Calendar, AlertTriangle, CheckCircle, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtDate, CONDITIONS } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

export default function MaintenancePage() {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [tab, setTab] = useState<"history" | "schedule">("history");

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["maintenance"],
    queryFn: async () => (await api.get("/maintenance", { params: { per_page: 100 } })).data,
  });

  const { data: firearms } = useQuery({
    queryKey: ["all-firearms"],
    queryFn: async () => (await api.get("/firearms", { params: { per_page: 200 } })).data,
  });

  const [form, setForm] = useState({
    equipment_id: "",
    description: "",
    maintenance_date: new Date().toISOString().slice(0, 10),
    next_schedule: "",
    condition_before: 70,
    condition_after: 90,
    maintenance_type: "Inspection",
    cost: 0,
    remarks: "",
  });

  const create = useMutation({
    mutationFn: () => api.post("/maintenance", { ...form, equipment_id: Number(form.equipment_id), cost: Number(form.cost) }),
    onSuccess: () => {
      toast.success("Maintenance recorded.");
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["maintenance"] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Failed."),
  });

  // Upcoming maintenance schedule from firearms data
  const upcomingMaintenance = (firearms?.data ?? [])
    .filter((f: any) => f.next_maintenance_due)
    .map((f: any) => ({
      equipment_id: f.equipment_id,
      serial_number: f.serial_number,
      model: f.model,
      condition: f.condition_status,
      due_date: f.next_maintenance_due,
      is_overdue: new Date(f.next_maintenance_due) < new Date(),
      days_until: Math.ceil((new Date(f.next_maintenance_due).getTime() - Date.now()) / 86400000),
    }))
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-olive-50 flex items-center gap-2"><Wrench className="h-5 w-5 text-olive-300" /> Maintenance</h1>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary"><Plus className="h-4 w-4" /> New Record</button>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1">
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-2 rounded-md text-xs uppercase tracking-widest transition-all ${
            tab === "history" ? "bg-olive-700/40 text-olive-100 border border-olive-500/40" : "text-steel-400 hover:text-olive-200"
          }`}
        >
          <Wrench className="h-3.5 w-3.5 inline mr-1.5" /> History
        </button>
        <button
          onClick={() => setTab("schedule")}
          className={`px-4 py-2 rounded-md text-xs uppercase tracking-widest transition-all ${
            tab === "schedule" ? "bg-olive-700/40 text-olive-100 border border-olive-500/40" : "text-steel-400 hover:text-olive-200"
          }`}
        >
          <Calendar className="h-3.5 w-3.5 inline mr-1.5" /> Schedule
        </button>
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="glass rounded-xl p-5 w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-3">
              <div className="flex justify-between items-center">
                <p className="section-title">New Maintenance Record</p>
                <button type="button" onClick={() => setShowForm(false)} className="btn-ghost text-xs"><X className="h-3.5 w-3.5" /></button>
              </div>

              {/* Firearm & Type */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-olive-300 mb-1.5">Firearm & Type</p>
                <div className="grid md:grid-cols-[2fr_1fr] gap-3">
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Firearm <span className="text-red-400">*</span></label>
                    <select className="input-field w-full h-[42px]" required value={form.equipment_id}
                            onChange={(e) => setForm({ ...form, equipment_id: e.target.value })}>
                      <option value="">— Select firearm —</option>
                      {firearms?.data?.map((f: any) => <option key={f.equipment_id} value={f.equipment_id}>{f.serial_number} · {f.model}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Type <span className="text-red-400">*</span></label>
                    <select className="input-field w-full h-[42px]" value={form.maintenance_type}
                            onChange={(e) => setForm({ ...form, maintenance_type: e.target.value })}>
                      <option>Inspection</option><option>Repair</option><option>Cleaning</option><option>Calibration</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Schedule & Condition */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-olive-300 mb-1.5">Schedule & Condition</p>
                <div className="grid md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Date <span className="text-red-400">*</span></label>
                    <input className="input-field w-full h-[42px]" type="date" required value={form.maintenance_date}
                           onChange={(e) => setForm({ ...form, maintenance_date: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Next Schedule</label>
                    <input className="input-field w-full h-[42px]" type="date" value={form.next_schedule}
                           onChange={(e) => setForm({ ...form, next_schedule: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Before %</label>
                    <input className="input-field w-full h-[42px]" type="number" min={0} max={100} value={form.condition_before}
                           onChange={(e) => setForm({ ...form, condition_before: Number(e.target.value) })} />
                  </div>
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">After %</label>
                    <input className="input-field w-full h-[42px]" type="number" min={0} max={100} value={form.condition_after}
                           onChange={(e) => setForm({ ...form, condition_after: Number(e.target.value) })} />
                  </div>
                </div>
              </div>

              {/* Description & Cost */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-olive-300 mb-1.5">Description & Cost</p>
                <div className="grid md:grid-cols-[3fr_1fr] gap-3">
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Description <span className="text-red-400">*</span></label>
                    <input className="input-field w-full h-[42px]" required placeholder="What was done" value={form.description}
                           onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Cost (PHP)</label>
                    <input className="input-field w-full h-[42px]" type="number" min={0} step="0.01" value={form.cost}
                           onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} />
                  </div>
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="text-xs text-steel-400 mb-1 block">Remarks</label>
                <textarea className="input-field w-full h-16" placeholder="Optional notes" value={form.remarks}
                          onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-steel-800">
                <button type="button" onClick={() => setShowForm(false)} className="btn-secondary text-xs">Cancel</button>
                <button disabled={create.isPending} className="btn-primary text-xs">
                  {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />} Save Record
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Schedule Tab */}
      {tab === "schedule" && (
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3 flex items-center gap-2"><Calendar className="h-4 w-4" /> Upcoming Maintenance Schedule</p>
          {upcomingMaintenance.length === 0 && (
            <p className="text-steel-400 text-sm py-4 text-center">No scheduled maintenance.</p>
          )}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {upcomingMaintenance.map((item: any) => (
              <div
                key={item.equipment_id}
                className={`rounded-lg border p-4 ${
                  item.is_overdue
                    ? "border-red-600/50 bg-red-900/10"
                    : item.days_until <= 3
                    ? "border-amber-600/50 bg-amber-900/10"
                    : "border-olive-700/30 bg-steel-900/40"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-olive-100 font-mono">{item.serial_number}</p>
                    <p className="text-xs text-steel-400">{item.model}</p>
                  </div>
                  {item.is_overdue ? (
                    <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  ) : item.days_until <= 3 ? (
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircle className="h-4 w-4 text-olive-400 shrink-0" />
                  )}
                </div>
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-steel-300">
                    Due: <span className={item.is_overdue ? "text-red-300 font-semibold" : "text-olive-200"}>
                      {fmtDate(item.due_date, "yyyy-MM-dd")}
                    </span>
                  </p>
                  <p className="text-xs text-steel-400">
                    {item.is_overdue
                      ? `Overdue by ${Math.abs(item.days_until)} day(s)`
                      : `In ${item.days_until} day(s)`}
                  </p>
                  <span className={`pill ${CONDITIONS[item.condition]?.tone}`}>
                    {CONDITIONS[item.condition]?.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* History Tab */}
      {tab === "history" && (
        <div className="glass rounded-xl p-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-[10px] uppercase tracking-widest text-olive-300">
              <th className="text-left py-2">Date</th><th className="text-center">Firearm</th><th className="text-center">Type</th><th className="text-center">Description</th>
              <th className="text-center">Before / After</th><th className="text-center">Tech</th><th className="text-center">Cost</th>
            </tr></thead>
            <tbody>
              {isError && <tr><td colSpan={7} className="py-0"><DataError onRetry={refetch} /></td></tr>}
              {isLoading && !isError && <tr><td colSpan={7} className="text-center py-4 text-steel-400">Loading…</td></tr>}
              {data?.data?.map((m: any) => (
                <tr key={m.maintenance_id} className="border-t border-steel-800">
                  <td className="py-1.5 text-xs text-steel-400">{fmtDate(m.maintenance_date, "yyyy-MM-dd")}</td>
                  <td className="text-center font-mono text-olive-100 text-xs">{m.firearm?.serial_number}</td>
                  <td className="text-center"><span className="pill pill-tactical">{m.maintenance_type}</span></td>
                  <td className="text-center text-steel-200 max-w-md truncate">{m.description}</td>
                  <td className="text-center text-xs">{m.condition_before}% → {m.condition_after}%</td>
                  <td className="text-center text-xs">{m.technician?.first_name} {m.technician?.last_name}</td>
                  <td className="text-center text-xs">PHP {Number(m.cost).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
