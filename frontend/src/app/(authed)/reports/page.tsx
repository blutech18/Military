"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileText } from "lucide-react";
import { TOKEN_COOKIE, api } from "@/lib/api";
import Cookies from "js-cookie";

const REPORTS = [
  { key: "inventory",             title: "Inventory Report",            description: "All registered firearms with status & condition." },
  { key: "transactions",          title: "Issuance / Return Report",    description: "Every checkout and return with personnel & purpose." },
  { key: "personnel-assignment",  title: "Personnel Assignment Report", description: "Who has what firearm, assignment history by personnel." },
  { key: "maintenance",           title: "Maintenance Report",          description: "Inspection, repair, cleaning records." },
  { key: "audit",                 title: "Audit Trail Report",          description: "Immutable log of every action." },
  { key: "security-incidents",    title: "Security Incident Report",    description: "Failed logins, access denials, geofence violations." },
] as const;

export default function ReportsPage() {
  const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
  const token = typeof window !== "undefined" ? Cookies.get(TOKEN_COOKIE) : "";
  const [gpsEquipmentId, setGpsEquipmentId] = useState("");

  const { data: firearms } = useQuery({
    queryKey: ["all-firearms-report"],
    queryFn: async () => (await api.get("/firearms", { params: { per_page: 200 } })).data,
  });

  async function download(key: string, format: "pdf" | "csv" | "xlsx") {
    const resp = await fetch(`${baseURL}/reports/${key}?format=${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) {
      alert("Download failed.");
      return;
    }
    const blob = await resp.blob();
    const a = document.createElement("a");
    const u = URL.createObjectURL(blob);
    a.href = u;
    a.download = `${key}-report-${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    URL.revokeObjectURL(u);
  }

  async function downloadGps(format: "pdf" | "csv" | "xlsx") {
    if (!gpsEquipmentId) { alert("Select a firearm first."); return; }
    const resp = await fetch(`${baseURL}/reports/gps/${gpsEquipmentId}?format=${format}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!resp.ok) { alert("Download failed."); return; }
    const blob = await resp.blob();
    const a = document.createElement("a");
    const u = URL.createObjectURL(blob);
    a.href = u;
    a.download = `gps-history-${gpsEquipmentId}-${new Date().toISOString().slice(0, 10)}.${format}`;
    a.click();
    URL.revokeObjectURL(u);
  }

  return (
    <div className="space-y-5">
      <div>
          <h1 className="text-2xl font-bold text-olive-50 flex items-center gap-2"><FileText className="h-5 w-5 text-olive-300" /> Reports</h1>
        <p className="text-sm text-steel-400">Export PDF, CSV, or Excel. Files are signed with the user's session.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {REPORTS.map((r) => (
          <div key={r.key} className="glass rounded-xl p-5">
            <p className="section-title">{r.key}</p>
            <h3 className="text-lg font-bold text-olive-50">{r.title}</h3>
            <p className="text-sm text-steel-400 mt-1">{r.description}</p>
            <div className="flex gap-2 mt-4">
              <button onClick={() => download(r.key, "pdf")} className="btn-primary text-xs"><Download className="h-3.5 w-3.5" /> PDF</button>
              <button onClick={() => download(r.key, "csv")} className="btn-secondary text-xs"><Download className="h-3.5 w-3.5" /> CSV</button>
              <button onClick={() => download(r.key, "xlsx")} className="btn-secondary text-xs"><Download className="h-3.5 w-3.5" /> Excel</button>
            </div>
          </div>
        ))}

        {/* GPS Movement History — requires firearm selection */}
        <div className="glass rounded-xl p-5">
          <p className="section-title">gps-history</p>
          <h3 className="text-lg font-bold text-olive-50">GPS Movement History</h3>
          <p className="text-sm text-steel-400 mt-1">Route and location history for a specific firearm.</p>
          <select
            className="input-field mt-3"
            value={gpsEquipmentId}
            onChange={(e) => setGpsEquipmentId(e.target.value)}
          >
            <option value="">— Select firearm —</option>
            {firearms?.data?.map((f: any) => (
              <option key={f.equipment_id} value={f.equipment_id}>
                {f.serial_number} · {f.model}
              </option>
            ))}
          </select>
          <div className="flex gap-2 mt-4">
            <button onClick={() => downloadGps("pdf")} disabled={!gpsEquipmentId} className="btn-primary text-xs"><Download className="h-3.5 w-3.5" /> PDF</button>
            <button onClick={() => downloadGps("csv")} disabled={!gpsEquipmentId} className="btn-secondary text-xs"><Download className="h-3.5 w-3.5" /> CSV</button>
            <button onClick={() => downloadGps("xlsx")} disabled={!gpsEquipmentId} className="btn-secondary text-xs"><Download className="h-3.5 w-3.5" /> Excel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
