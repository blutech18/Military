"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Users as UsersIcon, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { CLEARANCES, fmtRelative } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";
import { ActionModal } from "@/components/ui/action-modal";

export default function UsersPage() {
  const qc = useQueryClient();
  const [deactivateTarget, setDeactivateTarget] = useState<any | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["users"],
    queryFn: async () => (await api.get("/users", { params: { per_page: 100 } })).data,
  });

  const { data: roles } = useQuery({
    queryKey: ["roles"],
    queryFn: async () => (await api.get("/users/roles")).data,
  });

  const emptyForm = {
    username: "", email: "", password: "", first_name: "", last_name: "",
    rank: "PVT", role_id: 5, security_clearance: 1, phone: "", status: 1,
  };
  const [form, setForm] = useState(emptyForm);

  function startEdit(user: any) {
    setForm({
      username: user.username,
      email: user.email,
      password: "",
      first_name: user.first_name,
      last_name: user.last_name,
      rank: user.rank,
      role_id: user.role_id ?? user.role?.role_id ?? 5,
      security_clearance: user.security_clearance,
      phone: user.phone ?? "",
      status: user.status,
    });
    setEditing(user);
    setShowForm(true);
  }

  function resetForm() {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
  }

  const save = useMutation({
    mutationFn: () => {
      if (editing) {
        const payload: any = { ...form };
        if (!payload.password) delete payload.password;
        return api.patch(`/users/${editing.user_id}`, payload);
      }
      return api.post("/users", form);
    },
    onSuccess: () => {
      toast.success(editing ? "User updated." : "User created.");
      resetForm();
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Failed."),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success("User deactivated.");
      qc.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (e: any) => toast.error(e.response?.data?.message ?? "Delete failed."),
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-olive-50 flex items-center gap-2"><UsersIcon className="h-5 w-5 text-olive-300" /> User Management</h1>
        </div>
        <button onClick={() => { resetForm(); setShowForm((s) => !s); }} className="btn-primary"><Plus className="h-4 w-4" /> New User</button>
      </div>

      {showForm && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={resetForm}>
          <div className="glass rounded-xl p-6 w-full max-w-2xl max-h-[calc(100vh-2rem)] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="space-y-4">
              <div className="flex justify-between items-center mb-2">
                <p className="section-title">{editing ? `Edit: ${editing.username}` : "Create User"}</p>
                <button type="button" onClick={resetForm} className="btn-ghost text-xs"><X className="h-3.5 w-3.5" /></button>
              </div>

              {/* Account Credentials */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-olive-300 mb-2">Account Credentials</p>
                <div className="grid md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Username</label>
                    <input className="input-field w-full" required placeholder="e.g. pvt.dela.cruz" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Email</label>
                    <input className="input-field w-full" required type="email" placeholder="user@10rcdg.mil.ph" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs text-steel-400 mb-1 block">Password</label>
                    <input className="input-field w-full" type="password" placeholder={editing ? "Leave blank to keep current password" : "Minimum 10 characters"} required={!editing} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Personal Information */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-olive-300 mb-2">Personal Information</p>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">First Name</label>
                    <input className="input-field w-full" required placeholder="Juan" value={form.first_name} onChange={(e) => setForm({ ...form, first_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Last Name</label>
                    <input className="input-field w-full" required placeholder="Dela Cruz" value={form.last_name} onChange={(e) => setForm({ ...form, last_name: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Rank</label>
                    <input className="input-field w-full" required placeholder="e.g. SSG, CPL, PVT" value={form.rank} onChange={(e) => setForm({ ...form, rank: e.target.value })} />
                  </div>
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Phone</label>
                    <input className="input-field w-full" placeholder="09XXXXXXXXX" maxLength={11} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>
              </div>

              {/* Role & Access */}
              <div>
                <p className="text-[10px] uppercase tracking-widest text-olive-300 mb-2">Role & Access</p>
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Role</label>
                    <select className="input-field w-full" value={form.role_id} onChange={(e) => setForm({ ...form, role_id: Number(e.target.value) })}>
                      {roles?.map((r: any) => <option key={r.role_id} value={r.role_id}>{r.role_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs text-steel-400 mb-1 block">Security Clearance</label>
                    <select className="input-field w-full" value={form.security_clearance} onChange={(e) => setForm({ ...form, security_clearance: Number(e.target.value) })}>
                      <option value={1}>Confidential</option>
                      <option value={2}>Secret</option>
                      <option value={3}>Top Secret</option>
                    </select>
                  </div>
                  {editing && (
                    <div>
                      <label className="text-xs text-steel-400 mb-1 block">Status</label>
                      <select className="input-field w-full" value={form.status} onChange={(e) => setForm({ ...form, status: Number(e.target.value) })}>
                        <option value={1}>Active</option>
                        <option value={0}>Inactive</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-2 justify-end pt-2 border-t border-steel-800">
                <button type="button" onClick={resetForm} className="btn-secondary text-xs">Cancel</button>
                <button disabled={save.isPending} className="btn-primary text-xs">
                  {save.isPending && <Loader2 className="h-4 w-4 animate-spin" />} {editing ? "Update User" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      <div className="glass rounded-xl p-4">
        <table className="w-full text-sm">
          <thead><tr className="text-[10px] uppercase tracking-widest text-olive-300">
            <th className="text-left py-2">User</th><th className="text-center">Role</th><th className="text-center">Clearance</th><th className="text-center">Last login</th><th className="text-center">Status</th><th className="text-center">Actions</th>
          </tr></thead>
          <tbody>
            {isError && <tr><td colSpan={6} className="py-0"><DataError onRetry={refetch} /></td></tr>}
            {isLoading && !isError && <tr><td colSpan={6} className="text-center py-4 text-steel-400">Loading…</td></tr>}
            {data?.data?.map((u: any) => (
              <tr key={u.user_id} className="border-t border-steel-800">
                <td className="py-1.5">
                  <p className="text-olive-100">{u.rank} {u.first_name} {u.last_name}</p>
                  <p className="text-xs text-steel-400">@{u.username} · {u.email}</p>
                </td>
                <td className="text-center"><span className="pill pill-tactical">{u.role?.role_name}</span></td>
                <td className="text-center text-xs">{CLEARANCES[u.security_clearance]}</td>
                <td className="text-center text-xs text-steel-400">{u.last_login_at ? fmtRelative(u.last_login_at) : "Never"}</td>
                <td className="text-center"><span className={`pill ${u.status ? "pill-ok" : "pill-muted"}`}>{u.status ? "Active" : "Inactive"}</span></td>
                <td className="text-center">
                  <div className="flex justify-center gap-1">
                    <button onClick={() => startEdit(u)} className="btn-ghost text-xs"><Pencil className="h-3.5 w-3.5" /></button>
                    <button
                      onClick={() => setDeactivateTarget(u)}
                      className="btn-ghost text-xs text-red-400 hover:text-red-300"
                    ><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ActionModal
        open={deactivateTarget !== null}
        onClose={() => setDeactivateTarget(null)}
        onConfirm={() => {
          if (deactivateTarget) {
            remove.mutate(deactivateTarget.user_id);
            setDeactivateTarget(null);
          }
        }}
        title="Deactivate User"
        description={`Are you sure you want to deactivate "${deactivateTarget?.username}"? They will no longer be able to log in.`}
        confirmLabel="Deactivate"
        confirmVariant="danger"
      />
    </div>
  );
}
