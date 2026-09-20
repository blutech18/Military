"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Download,
  FileText,
  Eye,
  Loader2,
  Shield,
  ClipboardList,
  Users,
  Wrench,
  ShieldAlert,
  AlertTriangle,
  MapPin,
  FileSpreadsheet,
  Crosshair,
  ChevronDown,
  Search,
  X,
  Check,
} from "lucide-react";
import { TOKEN_COOKIE, api } from "@/lib/api";
import { cn } from "@/lib/utils";
import Cookies from "js-cookie";
import { toast } from "sonner";

interface ReportItem {
  key: string;
  title: string;
  description: string;
  badge: string;
  icon: any;
}

const REPORTS: ReportItem[] = [
  {
    key: "inventory",
    title: "Inventory Report",
    description: "Complete register of all firearms, condition scores, acquisition costs, and armory rack locations.",
    badge: "LOGISTICS",
    icon: Shield,
  },
  {
    key: "transactions",
    title: "Issuance & Return Report",
    description: "Full audit log of weapon checkouts, active duty assignments, expected return windows, and returns.",
    badge: "OPERATIONS",
    icon: ClipboardList,
  },
  {
    key: "personnel-assignment",
    title: "Personnel Assignment Report",
    description: "Cross-referenced roster of active duty personnel, assigned weapon systems, and custody history.",
    badge: "PERSONNEL",
    icon: Users,
  },
  {
    key: "maintenance",
    title: "Maintenance & Inspection Report",
    description: "Armorer inspections, scheduled cleanings, technical repairs, parts replacements, and costs.",
    badge: "READINESS",
    icon: Wrench,
  },
  {
    key: "audit",
    title: "System Audit Trail Report",
    description: "Cryptographically verifiable operational audit log recording all user actions, logins, and overrides.",
    badge: "COMPLIANCE",
    icon: ShieldAlert,
  },
  {
    key: "security-incidents",
    title: "Security Incident Report",
    description: "Compiled incident log covering failed MFA logins, access denials, and geofence perimeter alerts.",
    badge: "SECURITY",
    icon: AlertTriangle,
  },
];

interface FirearmOption {
  equipment_id: number;
  serial_number: string;
  model: string;
  current_location?: {
    location_name?: string;
  };
  category?: {
    category_name?: string;
  };
}

function FirearmSelect({
  firearms,
  value,
  onChange,
  disabled,
}: {
  firearms: FirearmOption[];
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const selectedFirearm = firearms.find((f) => String(f.equipment_id) === String(value));

  const filtered = firearms.filter((f) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      f.serial_number?.toLowerCase().includes(q) ||
      f.model?.toLowerCase().includes(q) ||
      f.current_location?.location_name?.toLowerCase().includes(q) ||
      f.category?.category_name?.toLowerCase().includes(q)
    );
  });

  return (
    <div ref={dropdownRef} className={cn("relative w-full", open ? "z-30" : "z-10")}>
      {/* Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center justify-between gap-3 px-3.5 py-2 rounded-lg text-xs transition-all",
          "bg-steel-900/90 border text-left",
          open
            ? "border-olive-500 ring-1 ring-olive-500/40 shadow-[0_0_15px_rgba(174,183,113,0.15)]"
            : "border-olive-700/40 hover:border-olive-600/70 hover:bg-steel-850",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Crosshair className="h-4 w-4 text-olive-300 shrink-0" />
          {selectedFirearm ? (
            <div className="flex items-center gap-2 min-w-0 truncate">
              <span className="font-mono font-bold text-olive-200">{selectedFirearm.serial_number}</span>
              <span className="text-steel-400">·</span>
              <span className="text-steel-200 truncate">{selectedFirearm.model}</span>
              {selectedFirearm.current_location?.location_name && (
                <span className="hidden sm:inline-block text-[10px] px-1.5 py-0.5 rounded bg-steel-800 text-steel-400 border border-olive-700/30">
                  {selectedFirearm.current_location.location_name}
                </span>
              )}
            </div>
          ) : (
            <span className="text-steel-400">Select firearm to report telemetry…</span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {selectedFirearm && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
                setSearch("");
              }}
              className="p-1 hover:text-red-400 text-steel-400 rounded transition-colors"
              title="Clear selection"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <ChevronDown className={cn("h-4 w-4 text-steel-400 transition-transform duration-200", open && "rotate-180")} />
        </div>
      </button>

      {/* Dropdown Menu Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 top-full mt-1.5 z-50 bg-[#0d1317] border border-olive-600/70 rounded-xl shadow-[0_25px_60px_rgba(0,0,0,0.95)] overflow-hidden"
          >
            {/* Search Filter Header */}
            <div className="p-2.5 border-b border-olive-700/40 bg-[#12191f]">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-steel-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter by serial, model, location..."
                  className="w-full bg-[#182128] border border-olive-700/50 rounded-lg pl-8 pr-3 py-1.5 text-xs text-olive-100 placeholder:text-steel-400 focus:outline-none focus:border-olive-500 focus:ring-1 focus:ring-olive-500/40"
                />
              </div>
            </div>

            {/* Firearm List */}
            <div className="max-h-60 overflow-y-auto divide-y divide-steel-800/60 p-1 bg-[#0d1317]">
              {filtered.length > 0 ? (
                filtered.map((f) => {
                  const isSelected = String(f.equipment_id) === String(value);
                  return (
                    <button
                      key={f.equipment_id}
                      type="button"
                      onClick={() => {
                        onChange(String(f.equipment_id));
                        setOpen(false);
                        setSearch("");
                      }}
                      className={cn(
                        "w-full flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-xs text-left transition-colors",
                        isSelected
                          ? "bg-olive-900/40 text-olive-100 border border-olive-500/40 font-semibold"
                          : "text-steel-300 hover:bg-[#161f26] hover:text-olive-50"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="font-mono font-bold text-olive-300 shrink-0">{f.serial_number}</span>
                        <span className="text-steel-500">·</span>
                        <span className="truncate">{f.model}</span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {f.current_location?.location_name && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-steel-800/80 text-steel-400 border border-olive-700/30">
                            {f.current_location.location_name}
                          </span>
                        )}
                        {isSelected && <Check className="h-3.5 w-3.5 text-olive-300" />}
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="py-6 text-center text-steel-500 text-xs">
                  No firearms found matching &quot;{search}&quot;
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ReportsPage() {
  const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
  const token = typeof window !== "undefined" ? Cookies.get(TOKEN_COOKIE) : "";
  const [gpsEquipmentId, setGpsEquipmentId] = useState("");

  // Tracks which action is currently processing, e.g. "inventory-pdf", "inventory-view", "gps-csv"
  const [activeAction, setActiveAction] = useState<string | null>(null);

  const { data: firearms } = useQuery({
    queryKey: ["all-firearms-report"],
    queryFn: async () => (await api.get("/firearms", { params: { per_page: 200 } })).data,
  });

  // View PDF in a new browser tab
  async function viewPdf(key: string, title: string, isGps = false) {
    const actionKey = isGps ? "gps-view" : `${key}-view`;
    setActiveAction(actionKey);
    const toastId = toast.loading(`Generating ${title} for preview...`);

    try {
      const url = isGps
        ? `${baseURL}/reports/gps/${gpsEquipmentId}?format=pdf&disposition=inline`
        : `${baseURL}/reports/${key}?format=pdf&disposition=inline`;

      const resp = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        throw new Error(`Failed to generate PDF (${resp.status} ${resp.statusText})`);
      }

      const blob = await resp.blob();
      const pdfBlob = new Blob([blob], { type: "application/pdf" });
      const fileUrl = URL.createObjectURL(pdfBlob);

      window.open(fileUrl, "_blank");
      toast.success(`${title} opened in new tab`, { id: toastId });
    } catch (err: any) {
      console.error("Error viewing PDF:", err);
      toast.error(err.message || "Failed to open PDF preview.", { id: toastId });
    } finally {
      setActiveAction(null);
    }
  }

  // Download Report (PDF, CSV, or Excel)
  async function download(key: string, format: "pdf" | "csv" | "xlsx", title: string) {
    const actionKey = `${key}-${format}`;
    setActiveAction(actionKey);
    const toastId = toast.loading(`Generating ${title} (${format.toUpperCase()})...`);

    try {
      const resp = await fetch(`${baseURL}/reports/${key}?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        throw new Error(`Download failed (${resp.status} ${resp.statusText})`);
      }

      const blob = await resp.blob();
      const a = document.createElement("a");
      const u = URL.createObjectURL(blob);
      a.href = u;
      a.download = `${key}-report-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(u);

      toast.success(`${title} (${format.toUpperCase()}) downloaded`, { id: toastId });
    } catch (err: any) {
      console.error("Download error:", err);
      toast.error(err.message || "Download failed.", { id: toastId });
    } finally {
      setActiveAction(null);
    }
  }

  // Download GPS Movement History
  async function downloadGps(format: "pdf" | "csv" | "xlsx") {
    if (!gpsEquipmentId) {
      toast.error("Please select a firearm first.");
      return;
    }

    const actionKey = `gps-${format}`;
    setActiveAction(actionKey);
    const toastId = toast.loading(`Generating GPS Movement History (${format.toUpperCase()})...`);

    try {
      const resp = await fetch(`${baseURL}/reports/gps/${gpsEquipmentId}?format=${format}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!resp.ok) {
        throw new Error(`Download failed (${resp.status} ${resp.statusText})`);
      }

      const blob = await resp.blob();
      const a = document.createElement("a");
      const u = URL.createObjectURL(blob);
      a.href = u;
      a.download = `gps-history-${gpsEquipmentId}-${new Date().toISOString().slice(0, 10)}.${format}`;
      a.click();
      URL.revokeObjectURL(u);

      toast.success(`GPS Movement History (${format.toUpperCase()}) downloaded`, { id: toastId });
    } catch (err: any) {
      console.error("GPS download error:", err);
      toast.error(err.message || "Download failed.", { id: toastId });
    } finally {
      setActiveAction(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-1">
        <div>
          <div>
            <h1 className="text-2xl font-bold tracking-wide text-olive-50 flex items-center gap-2">
              <FileText className="h-5 w-5 text-olive-300" /> Tactical Reports & Exports
            </h1>
          </div>
          <p className="text-xs text-steel-400 mt-0.5">
            Generate authenticated military armory reports. View inline PDF dossiers or export in PDF, CSV, and Excel formats.
          </p>
        </div>
      </div>

      {/* GPS Movement History — Full width above static reports */}
      {(() => {
        const isGpsViewing = activeAction === "gps-view";
        const isGpsPdf = activeAction === "gps-pdf";
        const isGpsCsv = activeAction === "gps-csv";
        const isGpsXlsx = activeAction === "gps-xlsx";

        return (
          <div className="glass rounded-xl p-5 space-y-4 hover:border-olive-500/40 transition-colors w-full relative z-20">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <MapPin className="h-5 w-5 text-olive-300 shrink-0" />
                <h3 className="text-base font-bold text-olive-50">GPS Movement History</h3>
              </div>
              <p className="text-xs text-steel-400 leading-relaxed">
                Time-series telemetry log, geofence boundary events, and coordinate history for a specific firearm.
              </p>
            </div>

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pt-1">
              <div className="flex-1 max-w-xl">
                <FirearmSelect
                  firearms={firearms?.data || []}
                  value={gpsEquipmentId}
                  onChange={setGpsEquipmentId}
                  disabled={!!activeAction}
                />
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* View PDF */}
                <button
                  onClick={() => viewPdf(`gps/${gpsEquipmentId}`, "GPS Movement History", true)}
                  disabled={!gpsEquipmentId || !!activeAction}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 min-w-[95px] justify-center disabled:opacity-50"
                >
                  {isGpsViewing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Opening…</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      <span>View PDF</span>
                    </>
                  )}
                </button>

                {/* Download PDF */}
                <button
                  onClick={() => downloadGps("pdf")}
                  disabled={!gpsEquipmentId || !!activeAction}
                  className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 min-w-[65px] justify-center disabled:opacity-50"
                  title="Download PDF telemetry report"
                >
                  {isGpsPdf ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 text-olive-300" />
                  )}
                  <span>PDF</span>
                </button>

                {/* Download CSV */}
                <button
                  onClick={() => downloadGps("csv")}
                  disabled={!gpsEquipmentId || !!activeAction}
                  className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 min-w-[65px] justify-center disabled:opacity-50"
                  title="Download CSV coordinate log"
                >
                  {isGpsCsv ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-steel-400" />
                  )}
                  <span>CSV</span>
                </button>

                {/* Download Excel */}
                <button
                  onClick={() => downloadGps("xlsx")}
                  disabled={!gpsEquipmentId || !!activeAction}
                  className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 min-w-[65px] justify-center disabled:opacity-50"
                  title="Download Excel telemetry workbook"
                >
                  {isGpsXlsx ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span>Excel</span>
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Standard Reports Grid */}
      <div className="grid md:grid-cols-2 gap-4 relative z-0">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          const isViewing = activeAction === `${r.key}-view`;
          const isDownloadingPdf = activeAction === `${r.key}-pdf`;
          const isDownloadingCsv = activeAction === `${r.key}-csv`;
          const isDownloadingXlsx = activeAction === `${r.key}-xlsx`;

          return (
            <div key={r.key} className="glass rounded-xl p-5 flex flex-col justify-between space-y-4 hover:border-olive-500/40 transition-colors">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2.5">
                  <Icon className="h-5 w-5 text-olive-300 shrink-0" />
                  <h3 className="text-base font-bold text-olive-50">{r.title}</h3>
                </div>
                <p className="text-xs text-steel-400 leading-relaxed">{r.description}</p>
              </div>

              {/* Action Buttons: View PDF + Downloads */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                {/* View PDF */}
                <button
                  onClick={() => viewPdf(r.key, r.title)}
                  disabled={!!activeAction}
                  className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 min-w-[95px] justify-center"
                >
                  {isViewing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      <span>Opening…</span>
                    </>
                  ) : (
                    <>
                      <Eye className="h-3.5 w-3.5" />
                      <span>View PDF</span>
                    </>
                  )}
                </button>

                {/* Download PDF */}
                <button
                  onClick={() => download(r.key, "pdf", r.title)}
                  disabled={!!activeAction}
                  className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 min-w-[65px] justify-center"
                  title="Download PDF document"
                >
                  {isDownloadingPdf ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Download className="h-3.5 w-3.5 text-olive-300" />
                  )}
                  <span>PDF</span>
                </button>

                {/* Download CSV */}
                <button
                  onClick={() => download(r.key, "csv", r.title)}
                  disabled={!!activeAction}
                  className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 min-w-[65px] justify-center"
                  title="Download CSV spreadsheet"
                >
                  {isDownloadingCsv ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-steel-400" />
                  )}
                  <span>CSV</span>
                </button>

                {/* Download Excel */}
                <button
                  onClick={() => download(r.key, "xlsx", r.title)}
                  disabled={!!activeAction}
                  className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1 min-w-[65px] justify-center"
                  title="Download Microsoft Excel workbook"
                >
                  {isDownloadingXlsx ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-400" />
                  )}
                  <span>Excel</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
