"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  CameraOff,
  ScanLine,
  QrCode,
  CheckCircle,
  XCircle,
  RotateCcw,
  ClipboardCheck,
  Volume2,
  VolumeX,
  RefreshCw,
  SlidersHorizontal,
  Download,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { CONDITIONS, STATUSES, cn } from "@/lib/utils";

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
  const scannerRef = useRef<any>(null);

  // Camera & Device states
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Inventory validation items
  const [scannedItems, setScannedItems] = useState<ScannedItem[]>([]);
  const [notFound, setNotFound] = useState<string[]>([]);
  const lastScanRef = useRef<{ text: string; time: number }>({ text: "", time: 0 });
  const isStartingRef = useRef(false);

  // Sound Feedback via Web Audio API
  const playBeep = useCallback(() => {
    if (!soundEnabled || typeof window === "undefined") return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.08);

      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

      osc.start();
      osc.stop(ctx.currentTime + 0.08);
    } catch {}
  }, [soundEnabled]);

  // Enumerate cameras once on mount
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        const devices = await Html5Qrcode.getCameras();
        if (active && devices && devices.length > 0) {
          const list = devices.map((d) => ({
            id: d.id,
            label: d.label || `Camera ${d.id.slice(0, 5)}`,
          }));
          setAvailableCameras(list);
          setSelectedCameraId((prev) => prev || list[0].id);
        }
      } catch (err) {
        console.warn("Could not enumerate cameras:", err);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Process firearm lookup
  const processLookup = useCallback(
    async (decoded: string) => {
      const trimmed = decoded.trim();
      if (!trimmed) return;

      // Extract serial if JSON payload
      let serialCandidate = trimmed;
      try {
        const payload = JSON.parse(trimmed);
        serialCandidate = payload.serial_number || payload.qr_code || trimmed;
      } catch {}

      // Avoid processing duplicates
      if (scannedItems.some((i) => i.serial_number === serialCandidate)) {
        return;
      }

      try {
        const { data } = await api.post("/firearms/lookup", { qr_payload: trimmed });
        setScannedItems((prev) => {
          if (prev.some((i) => i.equipment_id === data.equipment_id)) return prev;
          playBeep();
          toast.success(`Verified: ${data.serial_number} (${data.model})`);
          return [
            {
              equipment_id: data.equipment_id,
              serial_number: data.serial_number,
              model: data.model,
              condition_status: data.condition_status,
              availability_status: data.availability_status,
              found: true,
              scanned_at: new Date().toLocaleTimeString(),
            },
            ...prev,
          ];
        });
      } catch {
        setNotFound((prev) => {
          if (prev.includes(trimmed)) return prev;
          toast.error("Firearm not registered in database.");
          return [trimmed, ...prev];
        });
      }
    },
    [scannedItems, playBeep]
  );

  const processLookupRef = useRef(processLookup);
  useEffect(() => {
    processLookupRef.current = processLookup;
  }, [processLookup]);

  // Start camera
  const startCamera = useCallback(async (cameraId?: string) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setCameraError(null);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      if (scannerRef.current) {
        const prev = scannerRef.current;
        scannerRef.current = null;
        try {
          if (prev.isScanning) {
            await prev.stop();
          }
        } catch {}
        try {
          prev.clear();
        } catch {}
      }

      const viewport = document.getElementById("inventory-qr-viewport");
      if (!viewport) {
        isStartingRef.current = false;
        return;
      }

      const scanner = new Html5Qrcode("inventory-qr-viewport");
      scannerRef.current = scanner;

      const targetCamera = cameraId ? cameraId : { facingMode: "environment" };

      await scanner.start(
        targetCamera,
        { fps: 15 },
        async (decodedText: string) => {
          const now = Date.now();
          if (decodedText === lastScanRef.current.text && now - lastScanRef.current.time < 2500) {
            return;
          }
          lastScanRef.current = { text: decodedText, time: now };
          await processLookupRef.current(decodedText);
        },
        () => {}
      );

      setScanning(true);
    } catch (err: any) {
      console.error("Camera error:", err);
      setScanning(false);
      setCameraError(
        err?.message?.includes("Permission")
          ? "Camera permission denied. Please allow camera access in browser settings."
          : "Could not start camera. Check connection or HTTPS certificate."
      );
    } finally {
      isStartingRef.current = false;
    }
  }, []);

  // Stop camera
  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      const prev = scannerRef.current;
      scannerRef.current = null;
      try {
        if (prev.isScanning) {
          await prev.stop();
        }
      } catch {}
      try {
        prev.clear();
      } catch {}
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    startCamera(selectedCameraId || undefined);
    return () => {
      stopCamera();
    };
  }, [selectedCameraId, startCamera, stopCamera]);

  function resetSession() {
    setScannedItems([]);
    setNotFound([]);
    toast.info("Batch inventory session cleared.");
  }

  // Export audit summary as CSV
  function exportAuditCsv() {
    if (scannedItems.length === 0 && notFound.length === 0) {
      toast.error("No inventory data to export.");
      return;
    }
    const headers = ["Serial Number", "Model", "Condition", "Status", "Validation Result", "Scanned At"];
    const rows = [
      ...scannedItems.map((item) => [
        item.serial_number,
        `"${item.model}"`,
        CONDITIONS[item.condition_status]?.label || "N/A",
        STATUSES[item.availability_status]?.label || "N/A",
        "VERIFIED",
        item.scanned_at,
      ]),
      ...notFound.map((item) => [
        `"${item}"`,
        "Unknown",
        "N/A",
        "N/A",
        "UNREGISTERED / NOT FOUND",
        new Date().toLocaleTimeString(),
      ]),
    ];
    const csvContent =
      "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `armory_inventory_audit_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Inventory audit exported to CSV");
  }

  const totalScanned = scannedItems.length + notFound.length;
  const matchRate = totalScanned > 0 ? Math.round((scannedItems.length / totalScanned) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-olive-700/20">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-wide text-olive-50">Batch Inventory QR Validation</h1>
            <span className="pill pill-tactical text-[11px] font-mono flex items-center gap-1">
              <ClipboardCheck className="h-3 w-3" /> BATCH-VAL 1.0
            </span>
          </div>
          <p className="text-xs text-steel-400 mt-0.5">
            Continuous optical QR scanning to rapidly audit and validate physical armory stock against the database.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Sound Toggle */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            title={soundEnabled ? "Audio alert: Enabled" : "Audio alert: Muted"}
            className={cn(
              "btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 transition-colors",
              soundEnabled ? "text-olive-300 border-olive-500/40" : "text-steel-500"
            )}
          >
            {soundEnabled ? <Volume2 className="h-3.5 w-3.5 text-olive-300" /> : <VolumeX className="h-3.5 w-3.5 text-steel-500" />}
            <span>{soundEnabled ? "Audio Beep" : "Muted"}</span>
          </button>

          {/* Single Scan Navigation */}
          <Link href="/scan" className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <QrCode className="h-3.5 w-3.5 text-tactical-accent" />
            <span>Single QR Scan</span>
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-5 items-stretch">
        {/* LEFT COLUMN: SCANNER VIEWPORT (7 cols) */}
        <div className="lg:col-span-7 flex flex-col">
          <div className="glass rounded-xl p-4 sm:p-5 flex-1 flex flex-col justify-between lg:min-h-[540px]">
            {/* Header Strip */}
            <div className="flex items-center justify-between border-b border-olive-700/30 pb-3 mb-4">
              <div className="flex items-center gap-2">
                <Camera className="h-4 w-4 text-olive-300" />
                <span className="text-xs font-semibold text-olive-100 uppercase tracking-wider">
                  Continuous Optical Scanner
                </span>
              </div>

              <div className="flex items-center gap-2">
                {scanning && (
                  <span className="pill pill-tactical text-[10px] uppercase tracking-wider flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Optical Tracking Active
                  </span>
                )}
              </div>
            </div>

            {/* LIVE CAMERA VIEWPORT */}
            <div className="flex-1 flex flex-col justify-between space-y-3">
              <div className="relative aspect-video sm:aspect-[4/3] w-full max-h-[420px] mx-auto overflow-hidden rounded-lg bg-black border border-olive-700/50 shadow-inner flex items-center justify-center">
                {/* HTML5 QR Code Mount Target */}
                <div id="inventory-qr-viewport" ref={containerRef} className="absolute inset-0 w-full h-full" />

                {/* Viewfinder & Animated Laser Overlay */}
                {scanning && !cameraError && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6 overflow-hidden">
                    <div className="relative w-full h-full max-w-xs max-h-64 sm:max-h-72 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] border border-yellow-500/40">
                      {/* Tactical Reticle Corners */}
                      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-yellow-400 rounded-tl-lg z-20" />
                      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-yellow-400 rounded-tr-lg z-20" />
                      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-yellow-400 rounded-bl-lg z-20" />
                      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-yellow-400 rounded-br-lg z-20" />

                      {/* Sweeping Laser Beam with Glowing Aura */}
                      <div className="absolute left-0 right-0 h-1 bg-gradient-to-r from-yellow-400 via-white to-yellow-400 animate-laser z-10 shadow-[0_0_18px_4px_rgba(250,204,21,1)]">
                        <div className="absolute left-0 right-0 -top-8 h-8 bg-gradient-to-b from-transparent to-yellow-400/25 pointer-events-none" />
                        <div className="absolute left-0 right-0 top-1 h-8 bg-gradient-to-t from-transparent to-yellow-400/25 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                )}

                {/* Camera Error Overlay */}
                {cameraError && (
                  <div className="p-6 text-center space-y-3 z-10 max-w-sm">
                    <div className="h-10 w-10 mx-auto rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                      <CameraOff className="h-5 w-5" />
                    </div>
                    <p className="text-xs text-steel-300">{cameraError}</p>
                    <div className="flex gap-2 justify-center pt-2">
                      <button onClick={() => startCamera(selectedCameraId)} className="btn-secondary text-xs">
                        <RefreshCw className="h-3 w-3" /> Retry
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Hardware Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs mt-auto">
                {availableCameras.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <SlidersHorizontal className="h-3.5 w-3.5 text-steel-400" />
                    <select
                      value={selectedCameraId}
                      onChange={(e) => setSelectedCameraId(e.target.value)}
                      className="bg-steel-800 border border-olive-700/40 rounded px-2 py-1 text-xs text-olive-100"
                    >
                      {availableCameras.map((cam) => (
                        <option key={cam.id} value={cam.id}>
                          {cam.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                  {scanning ? (
                    <button onClick={stopCamera} className="btn-ghost text-xs py-1 px-2.5 text-amber-400">
                      <CameraOff className="h-3.5 w-3.5" /> Pause Feed
                    </button>
                  ) : (
                    <button onClick={() => startCamera(selectedCameraId)} className="btn-secondary text-xs py-1 px-2.5">
                      <Camera className="h-3.5 w-3.5" /> Start Camera
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: VALIDATION RESULTS AUDIT FEED (5 cols) */}
        <div className="lg:col-span-5 flex flex-col">
          <div className="glass rounded-xl p-4 sm:p-5 flex-1 flex flex-col justify-between lg:min-h-[540px]">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-olive-700/30 pb-3 mb-4">
              <p className="section-title flex items-center gap-2 m-0">
                <ClipboardCheck className="h-4 w-4 text-olive-300" /> Validation Results
              </p>

              <div className="flex items-center gap-2">
                <span className="pill pill-tactical text-[10px] font-mono">
                  {scannedItems.length} Verified
                </span>
                {totalScanned > 0 && (
                  <button
                    onClick={resetSession}
                    className="btn-ghost text-xs p-1 text-steel-400 hover:text-olive-100 flex items-center gap-1"
                    title="Clear current batch"
                  >
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                )}
              </div>
            </div>

            {/* Results List or Empty State */}
            <div className="flex-1 flex flex-col justify-between">
              {totalScanned === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="h-16 w-16 rounded-full bg-steel-900 border border-olive-700/40 flex items-center justify-center text-olive-400/60 shadow-inner">
                    <ScanLine className="h-8 w-8 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-olive-100">Awaiting Inventory Scans</h3>
                    <p className="text-xs text-steel-400 mt-1 max-w-xs">
                      Continuously present firearm QR labels before the camera. Verified weapons and anomalies will appear in real time.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-steel-500 font-mono pt-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-olive-400 animate-ping" />
                    BATCH AUDIT ARMED
                  </div>
                </div>
              ) : (
                <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                  <AnimatePresence initial={false}>
                    {scannedItems.map((item) => (
                      <motion.div
                        key={item.equipment_id}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between p-3 rounded-lg border border-emerald-700/30 bg-emerald-950/20 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                          <div className="truncate">
                            <span className="font-mono font-bold text-olive-100">{item.serial_number}</span>
                            <p className="text-[11px] text-steel-400 truncate">{item.model}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`pill text-[10px] ${STATUSES[item.availability_status]?.tone}`}>
                            {STATUSES[item.availability_status]?.label}
                          </span>
                          <span className="text-[10px] text-steel-500 font-mono hidden sm:inline">
                            {item.scanned_at}
                          </span>
                        </div>
                      </motion.div>
                    ))}

                    {notFound.map((tag, idx) => (
                      <motion.div
                        key={`not-found-${idx}`}
                        initial={{ opacity: 0, y: -6 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="flex items-center justify-between p-3 rounded-lg border border-red-700/30 bg-red-950/20 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <XCircle className="h-4 w-4 text-red-400 shrink-0" />
                          <div className="truncate">
                            <span className="font-bold text-red-200">Unregistered Firearm</span>
                            <p className="text-[11px] text-steel-400 font-mono truncate">{tag}</p>
                          </div>
                        </div>
                        <span className="pill pill-critical text-[10px]">ANOMALY</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {/* Bottom Summary Bar & Action Buttons */}
              <div className="space-y-3 pt-3 border-t border-olive-700/20 mt-auto">
                <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-steel-900/60 border border-olive-700/30 text-center">
                  <div>
                    <p className="text-base font-bold text-emerald-400 font-mono">{scannedItems.length}</p>
                    <p className="text-[10px] uppercase tracking-wider text-steel-400">Verified</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-red-400 font-mono">{notFound.length}</p>
                    <p className="text-[10px] uppercase tracking-wider text-steel-400">Discrepancy</p>
                  </div>
                  <div>
                    <p className="text-base font-bold text-olive-200 font-mono">{matchRate}%</p>
                    <p className="text-[10px] uppercase tracking-wider text-steel-400">Match Rate</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={exportAuditCsv}
                    disabled={totalScanned === 0}
                    className="btn-primary text-xs py-2 flex items-center justify-center gap-1.5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>Export Audit CSV</span>
                  </button>

                  <button
                    onClick={resetSession}
                    disabled={totalScanned === 0}
                    className="btn-secondary text-xs py-2 flex items-center justify-center gap-1.5"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Clear Batch</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
