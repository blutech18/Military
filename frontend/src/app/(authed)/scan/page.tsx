"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Camera, ScanLine, ShieldCheck, AlertCircle, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { CONDITIONS, STATUSES } from "@/lib/utils";
import Link from "next/link";

export default function ScanPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [hit, setHit] = useState<any | null>(null);

  useEffect(() => {
    let scanner: any;
    let cancelled = false;

    (async () => {
      const { Html5Qrcode } = await import("html5-qrcode");
      if (!containerRef.current || cancelled) return;
      scanner = new Html5Qrcode(containerRef.current.id);
      try {
        setScanning(true);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 240 }, aspectRatio: 1 },
          async (decoded: string) => {
            try {
              const { data } = await api.post("/firearms/lookup", { qr_payload: decoded });
              setHit(data);
              toast.success(`Resolved ${data.serial_number}`);
            } catch (e: any) {
              toast.error(e.response?.data?.message ?? "Firearm not found.");
            }
          },
          () => { /* ignore decode errors */ }
        );
      } catch (e) {
        console.error(e);
        toast.error("Could not access camera. Check permissions / HTTPS.");
      }
    })();

    return () => {
      cancelled = true;
      try { scanner?.stop(); scanner?.clear(); } catch {}
      setScanning(false);
    };
  }, []);

  return (
    <div className="space-y-5">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-olive-50">Scan Firearm QR</h1>
          <p className="text-sm text-steel-400">Point the device camera at the QR sticker on the firearm.</p>
        </div>
        <Link href="/scan/inventory" className="btn-secondary text-xs inline-flex">
          <ClipboardCheck className="h-3.5 w-3.5" /> Batch Inventory Validation
        </Link>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3 flex items-center gap-2">
            <Camera className="h-4 w-4" /> Live Camera
            {scanning && <span className="pill pill-tactical ml-auto"><ScanLine className="h-3 w-3" /> Scanning</span>}
          </p>
          <div className="relative aspect-square w-full overflow-hidden rounded-md bg-black border border-olive-700/40">
            <div id="qr-reader" ref={containerRef} className="absolute inset-0" />
            <div className="pointer-events-none absolute inset-x-8 top-1/4 bottom-1/4 border-2 border-olive-400/70 rounded-md">
              <div className="absolute left-0 right-0 h-0.5 bg-olive-300/80 animate-scan-line shadow-[0_0_8px_2px_rgba(174,183,113,0.7)]" />
            </div>
          </div>
          <p className="text-[11px] text-steel-500 mt-2">Powered by html5-qrcode · target ≥ 98 % success</p>
        </div>

        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Lookup Result</p>
          <AnimatePresence mode="wait">
            {hit ? (
              <motion.div
                key={hit.equipment_id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="space-y-2"
              >
                <p className="text-xl font-bold text-olive-50">{hit.model}</p>
                <p className="text-sm text-steel-400 font-mono">SN {hit.serial_number}</p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className={`pill ${CONDITIONS[hit.condition_status]?.tone}`}>{CONDITIONS[hit.condition_status]?.label}</span>
                  <span className={`pill ${STATUSES[hit.availability_status]?.tone}`}>{STATUSES[hit.availability_status]?.label}</span>
                </div>
                <dl className="grid grid-cols-2 gap-3 mt-4 text-sm">
                  <div><dt className="text-[10px] uppercase tracking-widest text-olive-300">Manufacturer</dt><dd>{hit.manufacturer}</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-widest text-olive-300">Caliber</dt><dd>{hit.caliber ?? "—"}</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-widest text-olive-300">Location</dt><dd>{hit.current_location?.location_name ?? "—"}</dd></div>
                  <div><dt className="text-[10px] uppercase tracking-widest text-olive-300">Category</dt><dd>{hit.category?.category_name}</dd></div>
                </dl>

                <div className="mt-4 flex gap-2">
                  <button onClick={() => router.push(`/firearms/${hit.equipment_id}`)} className="btn-secondary text-xs">Open Record</button>
                  <button onClick={() => router.push(`/transactions/new?equipment_id=${hit.equipment_id}`)} className="btn-primary text-xs">Issue / Return</button>
                </div>
              </motion.div>
            ) : (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-steel-400 flex items-center gap-2 text-sm">
                <AlertCircle className="h-4 w-4" /> Awaiting scan…
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
