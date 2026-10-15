"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { AxiosError } from "axios";
import { AlertTriangle, KeyRound, Loader2, X } from "lucide-react";

interface PasswordConfirmModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
  /** Runs the protected action; a rejected promise keeps the dialog open with the error shown. */
  onConfirm: (password: string) => Promise<unknown>;
}

/**
 * Deletes ask for the signed-in user's password again (the API checks it and logs failures),
 * so a session left open cannot be used to remove records.
 */
export function PasswordConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Delete",
  onClose,
  onConfirm,
}: PasswordConfirmModalProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!open || typeof document === "undefined") return null;

  const close = () => {
    if (busy) return;
    setPassword("");
    setError(null);
    onClose();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(password);
      setPassword("");
      onClose();
    } catch (err) {
      const data = err instanceof AxiosError ? (err.response?.data as { message?: string; errors?: Record<string, string[]> }) : undefined;
      setError(data?.errors?.password?.[0] ?? data?.message ?? "Could not complete the action.");
    } finally {
      setBusy(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={close}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()} className="glass rounded-xl p-6 w-full max-w-sm space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-300">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="text-sm font-bold uppercase tracking-widest">{title}</h3>
          </div>
          <button type="button" onClick={close} className="btn-ghost p-1" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-steel-300">{description}</p>

        <div>
          <label htmlFor="confirm-password" className="text-xs text-steel-400 mb-1 flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" /> Your password
          </label>
          <input
            id="confirm-password"
            type="password"
            autoComplete="current-password"
            autoFocus
            className="input-field w-full"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={busy}
          />
          {error && <p className="mt-1.5 text-xs text-red-300" role="alert">{error}</p>}
          <p className="mt-1.5 text-[11px] text-steel-500">This action is recorded in the audit trail under your name.</p>
        </div>

        <div className="flex gap-2 justify-end">
          <button type="button" onClick={close} disabled={busy} className="btn-secondary text-xs">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary bg-red-700 hover:bg-red-600 text-xs flex items-center gap-1.5">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body
  );
}
