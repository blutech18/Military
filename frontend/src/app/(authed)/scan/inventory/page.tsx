"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Camera, ScanLine, CheckCircle, XCircle, RotateCcw, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { CONDITIONS, STATUSES } from "@/lib/utils";

interface ScannedItem {
  equipment_id: number;
  serial_number: string;
  model: string;
  condition_status: number;
  availability_status: number;
  found: boolean;
  scanned_at: string;
}

export default function InventoryValidationPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);

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
            // Avoid duplicate scans
            try {
              const payload = JSON.parse(decoded);
              const serial = payload.serial_number || payload.qr_code;
              if (scannedItems.some(i => i.serial_number === serial) || notFound.includes(decoded)) return;
            } catch {
              if (notFound.includes(decoded)) return;
            }

            try {
              const { data } = await api.post("/firearms/lookup", { qr_payload: decoded });
              setScannedItems(prev => {
                if (prev.some(i => i.equipment_id === data.equipment_id)) return prev;
                return [...prev, {
                  equipment_id: data.equipment_id,
                  serial_number: data.serial_number,
                  model: data.model,
                  condition_status: data.condition_status,
                  availability_status: data.availability_status,
                  found: true,
                  scanned_at: new Date().toISOString(),
                }];
              });
              toast.success(`✓ ${data.serial_number}`);
            } catch {
              setNotFound(prev => prev.includes(decoded) ? prev : [...prev, decoded]);
              toast.error("Firearm not found in database.");
            }
          },
          () => {}
        );
      } catch (e) {
        console.error(e);
        toast.error("Could not access camera.");
      }
    })();

    return () => {
      cancelled = true;
      try { scanner?.stop(); scanner?.clear(); } catch {}
      setScanning(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reset() {
    setScannedItems([]);
    setNotFound([]);
  }

  return (
    <div className="space-y-5">
      <div>
          <h1 className="text-2xl font-bold text-olive-50 flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-olive-300" /> Batch QR Scan
        </h1>
        <p className="text-sm text-steel-400">
          Scan each firearm's QR code to validate physical inventory against the database.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Scanner */}
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3 flex items-center gap-2">
            <Camera className="h-4 w-4" /> Scanner
            {scanning && <span className="pill pill-tactical ml-auto"><ScanLine className="h-3 w-3" /> Active</span>}
          </p>
          <div className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-md bg-black border border-olive-700/40">
            <div id="inventory-qr-reader" ref={containerRef} className="absolute inset-0" />
            <div className="pointer-events-none absolute inset-x-8 top-1/4 bottom-1/4 border-2 border-olive-400/70 rounded-md">
              <div className="absolute left-0 right-0 h-0.5 bg-olive-300/80 animate-scan-line shadow-[0_0_8px_2px_rgba(174,183,113,0.7)]" />
            </div>
          </div>
          <div className="mt-3 flex justify-between items-center">
            <p className="text-[11px] text-steel-500">Scan continuously — duplicates are ignored.</p>
            <button onClick={reset} className="btn-ghost text-xs"><RotateCcw className="h-3.5 w-3.5" /> Reset</button>
          </div>
        </div>

        {/* Results */}
        <div className="glass rounded-xl p-4">
          <p className="section-title mb-3 flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Validation Results
            <span className="ml-auto pill pill-tactical">{scannedItems.length} scanned</span>
          </p>

          {scannedItems.length === 0 && notFound.length === 0 && (
            <p className="text-steel-400 text-sm py-8 text-center">Start scanning to validate inventory…</p>
          )}

          <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {scannedItems.map((item) => (
              <motion.div
                key={item.equipment_id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 rounded-md border border-emerald-700/30 bg-emerald-900/10 p-3"
              >
                <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono text-olive-100">{item.serial_number}</p>
                  <p className="text-xs text-steel-400">{item.model}</p>
                </div>
                <div className="flex gap-1.5">
                  <span className={`pill ${CONDITIONS[item.condition_status]?.tone}`}>
                    {CONDITIONS[item.condition_status]?.label}
                  </span>
                  <span className={`pill ${STATUSES[item.availability_status]?.tone}`}>
                    {STATUSES[item.availability_status]?.label}
                  </span>
                </div>
              </motion.div>
            ))}

            {notFound.map((qr, i) => (
              <motion.div
                key={`nf-${i}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center gap-3 rounded-md border border-red-700/30 bg-red-900/10 p-3"
              >
                <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-red-200">Not Found</p>
                  <p className="text-xs text-steel-500 font-mono truncate">{qr}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {scannedItems.length > 0 && (
            <div className="mt-4 pt-3 border-t border-olive-700/30">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-emerald-300">{scannedItems.length}</p>
                  <p className="text-[10px] uppercase tracking-widest text-steel-400">Verified</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-red-300">{notFound.length}</p>
                  <p className="text-[10px] uppercase tracking-widest text-steel-400">Not Found</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-olive-200">
                    {scannedItems.length > 0 ? Math.round((scannedItems.length / (scannedItems.length + notFound.length)) * 100) : 0}%
                  </p>
                  <p className="text-[10px] uppercase tracking-widest text-steel-400">Match Rate</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
