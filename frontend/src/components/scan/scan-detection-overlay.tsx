"use client";

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, Copy, Loader2, XCircle } from "lucide-react";
import type { ScanDetection } from "@/lib/use-qr-camera";
import { cn } from "@/lib/utils";

const TONES = {
  detected: {
    frame: "border-sky-300/80 bg-sky-400/10",
    banner: "border-sky-400/50 bg-sky-950/90 text-sky-100",
    icon: <Loader2 className="h-5 w-5 shrink-0 animate-spin text-sky-300" />,
    title: "QR detected",
    hint: "Looking up the record…",
  },
  success: {
    frame: "border-emerald-400/90 bg-emerald-400/15",
    banner: "border-emerald-400/50 bg-emerald-950/90 text-emerald-50",
    icon: <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-300" />,
    title: "Scan complete",
    hint: "Move away to scan another",
  },
  duplicate: {
    frame: "border-amber-300/90 bg-amber-400/15",
    banner: "border-amber-400/50 bg-amber-950/90 text-amber-50",
    icon: <Copy className="h-5 w-5 shrink-0 text-amber-300" />,
    title: "Already scanned",
    hint: "Move away to scan another",
  },
  error: {
    frame: "border-red-400/90 bg-red-500/15",
    banner: "border-red-400/50 bg-red-950/90 text-red-50",
    icon: <XCircle className="h-5 w-5 shrink-0 text-red-300" />,
    title: "Not recognised",
    hint: "Check the label and retry",
  },
} as const;

/**
 * Confirmation drawn on top of the live camera view, so a detected code is obvious without
 * looking away from the camera (toasts sit at the top of the screen, out of view on a phone).
 * Place it inside the relatively-positioned camera box.
 */
export function ScanDetectionOverlay({ detection }: { detection: ScanDetection | null }) {
  const tone = detection ? TONES[detection.status] : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30" role="status" aria-live="polite">
      <AnimatePresence>
        {detection && tone && (
          <motion.div
            key={detection.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0"
          >
            <div className={cn("absolute inset-0 border-4 transition-colors", tone.frame)} />
            <motion.div
              initial={{ y: 12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.18 }}
              className={cn(
                "absolute inset-x-3 bottom-3 flex items-center gap-2.5 rounded-lg border px-3 py-2.5 shadow-lg backdrop-blur-sm",
                tone.banner
              )}
            >
              {tone.icon}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-tight truncate">
                  {detection.status !== "detected" && detection.label ? detection.label : tone.title}
                </p>
                <p className="text-[11px] leading-tight opacity-80 truncate">
                  {detection.status !== "detected" && detection.label ? `${tone.title} · ${tone.hint}` : tone.hint}
                </p>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
