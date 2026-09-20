"use client";

import React from "react";
import { fmtRelative } from "@/lib/utils";
import { humanizeAuditAction } from "@/lib/audit";

export interface AuditFeedItem {
  log_id: number;
  action: string;
  description: string;
  created_at: string;
  ip_address: string;
  user?: {
    username: string;
    [key: string]: any;
  } | null;
}

interface AuditFeedProps {
  items?: AuditFeedItem[];
  maxHeight?: string;
}

export function AuditFeed({ items = [], maxHeight = "max-h-[320px]" }: AuditFeedProps) {
  if (!items || items.length === 0) {
    return <p className="text-xs text-steel-500 py-4 text-center">No recent audit logs.</p>;
  }

  return (
    <ol className={`space-y-2 overflow-y-auto pr-2 ${maxHeight}`}>
      {items.map((a) => (
        <li key={a.log_id} className="border-l-2 border-olive-600/40 pl-3 py-1">
          <p className="text-xs text-olive-200 font-semibold flex justify-between">
            <span>{humanizeAuditAction(a.action)}</span>
            <span className="text-steel-500">{fmtRelative(a.created_at)}</span>
          </p>
          <p className="text-xs text-steel-400 truncate">{a.description}</p>
          <p className="text-[10px] text-steel-500 mt-0.5">
            {a.user?.username ?? "system"} · {a.ip_address}
          </p>
        </li>
      ))}
    </ol>
  );
}
