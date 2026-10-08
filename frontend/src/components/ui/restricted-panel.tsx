"use client";

import Link from "next/link";
import { Lock } from "lucide-react";
import { CLEARANCES } from "@/lib/utils";

interface RestrictedPanelProps {
  /** Minimum clearance level the page needs (1 Confidential, 2 Secret, 3 Top Secret). */
  required: number;
  /** The signed-in user's clearance level. */
  current?: number | null;
}

/** Shown instead of a page the user's security clearance does not cover. */
export function RestrictedPanel({ required, current }: RestrictedPanelProps) {
  const currentLabel = current ? CLEARANCES[current] : undefined;

  return (
    <div className="glass rounded-xl p-6 sm:p-10 flex flex-col items-center text-center gap-3 max-w-xl mx-auto mt-4 sm:mt-10">
      <div className="h-12 w-12 rounded-full bg-amber-900/30 border border-amber-600/30 flex items-center justify-center">
        <Lock className="h-6 w-6 text-amber-300" />
      </div>
      <h2 className="text-base sm:text-lg font-semibold text-olive-50">Restricted: {CLEARANCES[required]} clearance required</h2>
      <p className="text-sm text-steel-300 leading-relaxed">
        This page needs <span className="font-semibold text-olive-100">{CLEARANCES[required]}</span> clearance or higher.
        {currentLabel ? (
          <>
            {" "}Your account has <span className="font-semibold text-olive-100">{currentLabel}</span> clearance.
          </>
        ) : null}
      </p>
      <p className="text-xs text-steel-400 leading-relaxed">
        Ask an administrator to raise your security clearance in User Management. The change applies here within a
        minute, without signing out.
      </p>
      <Link href="/dashboard" className="btn-secondary text-xs mt-1">
        Back to dashboard
      </Link>
    </div>
  );
}
