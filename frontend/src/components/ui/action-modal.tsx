"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, Loader2, X } from "lucide-react";

interface ActionModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description: string;
  confirmLabel?: string;
  confirmVariant?: "danger" | "primary";
  loading?: boolean;
  children?: React.ReactNode;
}

export function ActionModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  confirmVariant = "danger",
  loading = false,
  children,
}: ActionModalProps) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            onClick={(e) => e.stopPropagation()}
            className="glass rounded-xl p-6 w-full max-w-sm space-y-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-300">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="text-sm font-bold uppercase tracking-widest">{title}</h3>
              </div>
              <button onClick={onClose} className="btn-ghost p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-steel-300">{description}</p>
            {children}
            <div className="flex gap-2 justify-end">
              <button onClick={onClose} disabled={loading} className="btn-secondary text-xs">
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={loading}
                className={`text-xs flex items-center gap-1.5 ${
                  confirmVariant === "danger"
                    ? "btn-primary bg-red-700 hover:bg-red-600"
                    : "btn-primary"
                }`}
              >
                {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
