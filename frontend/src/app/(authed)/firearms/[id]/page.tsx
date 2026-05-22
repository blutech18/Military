"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Download, Crosshair, History, Wrench } from "lucide-react";
import { api } from "@/lib/api";
import { CONDITIONS, STATUSES, fmtDate, PURPOSES } from "@/lib/utils";
import { DataError } from "@/components/ui/data-error";

export default function FirearmDetailPage() {
  const router = useRouter();
  const { id } = useParams() as { id: string };
  const [qrSvg, setQrSvg] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["firearm", id],
    queryFn: async () => (await api.get(`/firearms/${id}`)).data,
  });

  async function loadQr() {
    const resp = await api.get(`/firearms/${id}/qr`, { responseType: "text" });
    setQrSvg(resp.data);
  }

  if (isError) return <DataError onRetry={refetch} />;
  if (isLoading || !data) return <p className="text-steel-300">Loading…</p>;

  return (
    <div className="space-y-5">
      <button onClick={() => router.back()} className="btn-ghost text-xs"><ArrowLeft className="h-3.5 w-3.5" /> Back</button>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-xl p-6">
          <h1 className="text-2xl font-bold text-olive-50">{data.model}</h1>
          <p className="text-sm text-steel-400 font-mono">SN {data.serial_number} · QR {data.qr_code}</p>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
            <Field label="Manufacturer" value={data.manufacturer} />
            <Field label="Caliber" value={data.caliber ?? "—"} />
            <Field label="Category" value={data.category?.category_name} />
            <Field label="Condition" value={
              <span className={`pill ${CONDITIONS[data.condition_status]?.tone}`}>{CONDITIONS[data.condition_status]?.label}</span>
            } />
            <Field label="Status" value={
              <span className={`pill ${STATUSES[data.availability_status]?.tone}`}>{STATUSES[data.availability_status]?.label}</span>
            } />
            <Field label="Location" value={data.current_location?.location_name ?? "—"} />
            <Field label="Acquired" value={fmtDate(data.acquisition_date, "yyyy-MM-dd")} />
            <Field label="Acquisition Cost" value={`PHP ${Number(data.acquisition_cost).toLocaleString()}`} />
            <Field label="Next Maintenance" value={data.next_maintenance_due ? fmtDate(data.next_maintenance_due, "yyyy-MM-dd") : "—"} />
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <a className="btn-secondary text-xs" href={`/gps?equipment_id=${id}`}><Crosshair className="h-4 w-4" /> View on Map</a>
            <a className="btn-secondary text-xs" href={`/transactions?equipment_id=${id}`}><History className="h-4 w-4" /> History</a>
            <a className="btn-secondary text-xs" href={`/maintenance?equipment_id=${id}`}><Wrench className="h-4 w-4" /> Maintenance</a>
          </div>
        </div>

        <div className="glass rounded-xl p-4 flex flex-col">
          <p className="section-title mb-2">QR Identification</p>
          <motion.div layout className="bg-steel-900/60 rounded-md p-4 flex-1 flex items-center justify-center min-h-[260px]">
            {qrSvg ? (
              <div className="w-full max-w-[260px]" dangerouslySetInnerHTML={{ __html: qrSvg }} />
            ) : (
              <button onClick={loadQr} className="btn-primary"><Download className="h-4 w-4" /> Generate QR Code</button>
            )}
          </motion.div>
          {qrSvg && (
            <a
              className="btn-ghost mt-3 text-xs"
              download={`armory-${data.serial_number}.svg`}
              href={`data:image/svg+xml;base64,${typeof window === "undefined" ? "" : btoa(unescape(encodeURIComponent(qrSvg)))}`}
            >
              <Download className="h-4 w-4" /> Download SVG
            </a>
          )}
        </div>
      </div>

      {/* Recent transactions */}
      <div className="glass rounded-xl p-4">
        <p className="section-title mb-3">Assignment History</p>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-olive-300">
            <tr><th className="text-left py-1">Tx</th><th className="text-center">Personnel</th><th className="text-center">Authorized By</th><th className="text-center">Purpose</th><th className="text-center">Checkout</th><th className="text-center">Returned</th><th className="text-center">Status</th></tr>
          </thead>
          <tbody>
            {data.transactions?.map((t: any) => (
              <tr key={t.transaction_id} className="border-t border-steel-800">
                <td className="font-mono text-olive-200 py-1.5">#{t.transaction_id}</td>
                <td className="text-center text-steel-200">{t.user?.first_name} {t.user?.last_name}</td>
                <td className="text-center text-steel-400 text-xs">#{t.authorized_by}</td>
                <td className="text-center text-xs">{PURPOSES[t.purpose] ?? "—"}</td>
                <td className="text-center text-xs text-steel-400">{fmtDate(t.checkout_at)}</td>
                <td className="text-center text-xs text-steel-400">{t.actual_return_at ? fmtDate(t.actual_return_at) : "—"}</td>
                <td className="text-center"><span className={`pill pill-${t.status === "Active" ? "info" : t.status === "Overdue" ? "critical" : "ok"}`}>{t.status}</span></td>
              </tr>
            ))}
            {(!data.transactions || data.transactions.length === 0) && (
              <tr><td colSpan={7} className="text-steel-500 py-3 text-center text-xs">No history yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-olive-300">{label}</p>
      <div className="text-sm text-olive-50 mt-0.5">{value}</div>
    </div>
  );
}
