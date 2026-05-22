"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { fmtRelative } from "@/lib/utils";
import { CheckCheck, BellRing } from "lucide-react";
import { toast } from "sonner";
import { DataError } from "@/components/ui/data-error";

export default function NotificationsPage() {
  const qc = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["notifications-page"],
    queryFn: async () => (await api.get("/notifications", { params: { per_page: 100 } })).data,
  });

  const markAll = useMutation({
    mutationFn: () => api.post("/notifications/mark-all-read"),
    onSuccess: () => {
      toast.success("All marked as read.");
      qc.invalidateQueries({ queryKey: ["notifications-page"] });
      qc.invalidateQueries({ queryKey: ["unread-notifications"] });
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-olive-50 flex items-center gap-2"><BellRing className="h-5 w-5 text-olive-300" /> Notifications</h1>
        </div>
        <button onClick={() => markAll.mutate()} className="btn-secondary text-xs">
          <CheckCheck className="h-4 w-4" /> Mark all read
        </button>
      </div>

      <div className="space-y-2">
        {isError && <DataError onRetry={refetch} />}
        {isLoading && !isError && <p className="text-steel-300">Loading…</p>}
        {data?.data?.length === 0 && <p className="text-steel-400">No notifications.</p>}
        {data?.data?.map((n: any) => (
          <div key={n.notification_id} className={`glass rounded-md p-3 flex gap-3 border-l-4 ${
            n.severity === "critical" ? "border-red-500" : n.severity === "warning" ? "border-amber-500" : "border-blue-500"
          }`}>
            <div className="flex-1">
              <div className="flex justify-between gap-2">
                <p className="text-sm font-semibold text-olive-100">{n.title}</p>
                <span className="text-[10px] text-steel-500">{fmtRelative(n.created_at)}</span>
              </div>
              <p className="text-xs text-steel-300 mt-0.5">{n.message}</p>
              <div className="flex gap-2 mt-2">
                <span className={`pill pill-${n.severity === "critical" ? "critical" : n.severity === "warning" ? "warn" : "info"}`}>{n.severity.toUpperCase()}</span>
                <span className="pill pill-muted">{n.type}</span>
                {n.firearm && <span className="pill pill-tactical">{n.firearm.serial_number}</span>}
              </div>
            </div>
            {n.status === "Unread" && <span className="h-2 w-2 mt-2 rounded-full bg-olive-400 animate-pulse" />}
          </div>
        ))}
      </div>
    </div>
  );
}
