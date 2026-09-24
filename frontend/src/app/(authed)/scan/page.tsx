"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  CameraOff,
  ScanLine,
  ShieldCheck,
  AlertCircle,
  ClipboardCheck,
  Keyboard,
  UploadCloud,
  Volume2,
  VolumeX,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  Wrench,
  MapPin,
  User,
  Clock,
  ArrowRight,
  Search,
  CheckCircle2,
  RefreshCw,
  SlidersHorizontal,
  History,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { CONDITIONS, STATUSES, cn } from "@/lib/utils";

interface ActiveTransaction {
  transaction_id: number;
  status: string;
  checkout_at: string;
  expected_return_at: string;
  user?: {
    user_id: number;
    first_name: string;
    last_name: string;
    rank?: string;
  };
}

interface FirearmLookupResult {
  equipment_id: number;
  serial_number: string;
  model: string;
  manufacturer: string;
  caliber?: string;
  condition_status: number;
  availability_status: number;
  qr_code?: string;
  category?: {
    category_id: number;
    category_name: string;
  };
  current_location?: {
    location_id: number;
    location_name: string;
  };
  transactions?: ActiveTransaction[];
}

interface RecentScan {
  equipment_id: number;
  serial_number: string;
  model: string;
  availability_status: number;
  timestamp: string;
  data: FirearmLookupResult;
}

export default function ScanPage() {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scannerRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Mode: "camera" | "manual" | "file"
  const [mode, setMode] = useState<"camera" | "manual" | "file">("camera");

  // Scanner States
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [availableCameras, setAvailableCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Lookup Result & Session History
  const [hit, setHit] = useState<FirearmLookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [recentScans, setRecentScans] = useState<RecentScan[]>([]);
  const [copiedSerial, setCopiedSerial] = useState(false);

  // Manual Input State
  const [manualInput, setManualInput] = useState("");

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

  // Handle successful lookup resolution
  const handleResolve = useCallback(
    (firearm: FirearmLookupResult) => {
      playBeep();
      setHit(firearm);
      toast.success(`Target Acquired: ${firearm.model} (${firearm.serial_number})`);

      setRecentScans((prev) => {
        const filtered = prev.filter((r) => r.equipment_id !== firearm.equipment_id);
        return [
          {
            equipment_id: firearm.equipment_id,
            serial_number: firearm.serial_number,
            model: firearm.model,
            availability_status: firearm.availability_status,
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
            data: firearm,
          },
          ...filtered,
        ].slice(0, 10);
      });
    },
    [playBeep]
  );

  // Lookup by QR payload or raw serial string
  const performLookup = useCallback(
    async (payloadStr: string) => {
      const trimmed = payloadStr.trim();
      if (!trimmed) return;
      setLoading(true);
      try {
        const { data } = await api.post("/firearms/lookup", { qr_payload: trimmed });
        handleResolve(data);
      } catch (e: any) {
        toast.error(e.response?.data?.message ?? "Firearm not found in database.");
      } finally {
        setLoading(false);
      }
    },
    [handleResolve]
  );

  // Stable ref for performLookup to avoid triggering camera restarts
  const performLookupRef = useRef(performLookup);
  useEffect(() => {
    performLookupRef.current = performLookup;
  }, [performLookup]);

  const lastScanRef = useRef<{ text: string; time: number }>({ text: "", time: 0 });
  const isStartingRef = useRef(false);

  // Enumerate cameras once on mount without triggering camera restarts
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

  // Stable camera starter
  const startCamera = useCallback(async (cameraId?: string) => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setCameraError(null);

    try {
      const { Html5Qrcode } = await import("html5-qrcode");

      // Safely tear down existing instance if any
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

      const viewport = document.getElementById("qr-camera-viewport");
      if (!viewport) {
        isStartingRef.current = false;
        return;
      }

      const scanner = new Html5Qrcode("qr-camera-viewport");
      scannerRef.current = scanner;

      const targetCamera = cameraId ? cameraId : { facingMode: "environment" };

      await scanner.start(
        targetCamera,
        {
          fps: 15,
        },
        async (decodedText: string) => {
          const now = Date.now();
          if (decodedText === lastScanRef.current.text && now - lastScanRef.current.time < 3000) {
            return;
          }
          lastScanRef.current = { text: decodedText, time: now };
          await performLookupRef.current(decodedText);
        },
        () => {
          // Ignore empty frames
        }
      );

      setScanning(true);
    } catch (err: any) {
      console.error("Camera error:", err);
      setScanning(false);
      setCameraError(
        err?.message?.includes("Permission")
          ? "Camera permission denied. Please allow camera access in browser settings."
          : "Could not start camera. Check connection or switch to Manual / USB mode."
      );
    } finally {
      isStartingRef.current = false;
    }
  }, []);

  // Stable camera stopper
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

  // Manage camera lifecycle strictly based on mode and selected camera id
  useEffect(() => {
    if (mode === "camera") {
      startCamera(selectedCameraId || undefined);
    } else {
      stopCamera();
    }

    return () => {
      stopCamera();
    };
  }, [mode, selectedCameraId, startCamera, stopCamera]);

  // Handle image file scan
  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const html5Qr = new Html5Qrcode("file-scan-dummy");
      const decoded = await html5Qr.scanFile(file, true);
      html5Qr.clear();
      await performLookup(decoded);
    } catch {
      toast.error("No valid QR code detected in the uploaded image.");
    } finally {
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  // Copy Serial Number
  function copySerial(serial: string) {
    navigator.clipboard.writeText(serial);
    setCopiedSerial(true);
    toast.success(`Copied ${serial} to clipboard`);
    setTimeout(() => setCopiedSerial(false), 2000);
  }

  // Active transaction details if checked out
  const activeTx = hit?.transactions && hit.transactions.length > 0 ? hit.transactions[0] : null;
  const isCheckedOut = hit?.availability_status === 2 || hit?.availability_status === 4;

  return (
    <div className="space-y-6">
      {/* Hidden container for image decoding */}
      <div id="file-scan-dummy" className="hidden" />

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-olive-700/20">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-wide text-olive-50">Optical & Barcode Scanner</h1>
            <span className="pill pill-tactical text-[11px] font-mono">OPT-SCN 1.4</span>
          </div>
          <p className="text-xs text-steel-400 mt-0.5">
            Real-time QR recognition, USB hardware scanner wedge, and manual armory serial lookup.
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

          {/* Batch Scan Navigation */}
          <Link href="/scan/inventory" className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5">
            <ClipboardCheck className="h-3.5 w-3.5 text-tactical-accent" />
            <span>Batch Inventory</span>
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-12 gap-5">
        {/* LEFT COLUMN: SCANNER VIEWPORT & INPUT MODES (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="glass rounded-xl p-4 sm:p-5 space-y-4">
            {/* Mode Switcher Tabs */}
            <div className="flex items-center justify-between border-b border-olive-700/30 pb-3">
              <div className="flex items-center gap-1.5 bg-steel-900/90 p-1 rounded-lg border border-olive-700/30">
                <button
                  onClick={() => setMode("camera")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                    mode === "camera"
                      ? "bg-tactical-surface text-olive-100 shadow-sm border border-olive-500/50"
                      : "text-steel-400 hover:text-steel-200"
                  )}
                >
                  <Camera className="h-3.5 w-3.5" />
                  <span>Live Camera</span>
                </button>

                <button
                  onClick={() => setMode("manual")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                    mode === "manual"
                      ? "bg-tactical-surface text-olive-100 shadow-sm border border-olive-500/50"
                      : "text-steel-400 hover:text-steel-200"
                  )}
                >
                  <Keyboard className="h-3.5 w-3.5" />
                  <span>Hardware / Wedge</span>
                </button>

                <button
                  onClick={() => setMode("file")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all",
                    mode === "file"
                      ? "bg-tactical-surface text-olive-100 shadow-sm border border-olive-500/50"
                      : "text-steel-400 hover:text-steel-200"
                  )}
                >
                  <UploadCloud className="h-3.5 w-3.5" />
                  <span>Upload QR</span>
                </button>
              </div>

              {/* Status Indicator */}
              <div className="flex items-center gap-2">
                {mode === "camera" && scanning && (
                  <span className="pill pill-tactical text-[10px] uppercase tracking-wider flex items-center gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Optical Tracking
                  </span>
                )}
                {mode === "manual" && (
                  <span className="pill pill-ok text-[10px] uppercase tracking-wider flex items-center gap-1">
                    <Keyboard className="h-3 w-3" />
                    Wedge Ready
                  </span>
                )}
                {mode === "file" && (
                  <span className="pill pill-info text-[10px] uppercase tracking-wider flex items-center gap-1">
                    <UploadCloud className="h-3 w-3" />
                    Image Decoder
                  </span>
                )}
              </div>
            </div>

            {/* TAB 1: LIVE CAMERA VIEWPORT */}
            {mode === "camera" && (
              <div className="space-y-3">
                <div className="relative aspect-video sm:aspect-[4/3] w-full max-h-[420px] mx-auto overflow-hidden rounded-lg bg-black border border-olive-700/50 shadow-inner flex items-center justify-center">
                  {/* HTML5 QR Code Mount Target */}
                  <div id="qr-camera-viewport" ref={containerRef} className="absolute inset-0 w-full h-full" />

                  {/* Clean Viewfinder & Scan Line Overlay */}
                  {scanning && !cameraError && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                      <div className="relative w-full h-full max-w-sm max-h-64 border border-olive-500/40 rounded-lg overflow-hidden">
                        {/* Animated Scanning Laser Beam */}
                        <div className="absolute left-0 right-0 h-0.5 bg-olive-300 animate-scan-line shadow-[0_0_10px_2px_rgba(174,183,113,0.85)]" />
                      </div>
                    </div>
                  )}

                  {/* Camera Error / Standby Overlay */}
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
                        <button onClick={() => setMode("manual")} className="btn-primary text-xs">
                          Use Manual / Wedge
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Camera Hardware Controls */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
                  {availableCameras.length > 1 && (
                    <div className="flex items-center gap-1.5">
                      <SlidersHorizontal className="h-3.5 w-3.5 text-steel-400" />
                      <select
                        value={selectedCameraId}
                        onChange={(e) => {
                          setSelectedCameraId(e.target.value);
                        }}
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
            )}

            {/* TAB 2: MANUAL / USB BARCODE SCANNER WEDGE */}
            {mode === "manual" && (
              <div className="space-y-4 py-2">
                <div className="p-4 rounded-lg bg-steel-900/60 border border-olive-700/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-olive-100 flex items-center gap-1.5">
                      <Keyboard className="h-4 w-4 text-olive-300" />
                      Barcode Gun Wedge / Serial Number Input
                    </label>
                    <span className="text-[10px] text-steel-400 font-mono">Press ENTER to Search</span>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      performLookup(manualInput);
                    }}
                    className="flex gap-2"
                  >
                    <div className="relative flex-1">
                      <input
                        type="text"
                        autoFocus
                        value={manualInput}
                        onChange={(e) => setManualInput(e.target.value)}
                        placeholder="Scan with barcode gun or type serial (e.g. PA-M4-001)..."
                        className="input font-mono text-sm w-full pl-9 bg-steel-800 border-olive-700/50"
                      />
                      <Search className="h-4 w-4 text-steel-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                    <button type="submit" disabled={loading || !manualInput.trim()} className="btn-primary text-xs px-4">
                      {loading ? "Searching..." : "Lookup"}
                    </button>
                  </form>

                  <p className="text-[11px] text-steel-400">
                    💡 Handheld USB/Bluetooth barcode guns input characters and automatically submit on newline. Keep this field focused when scanning physically.
                  </p>
                </div>

                {/* Quick Test Chips */}
                <div className="space-y-1.5 pt-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-steel-400">Quick Test Weapon Serials:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {["PA-M4-001", "PA-M4-002", "PA-M16-001", "PA-M16-002", "PA-PI-001"].map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setManualInput(s);
                          performLookup(s);
                        }}
                        className="px-2.5 py-1 rounded bg-steel-800 hover:bg-tactical-surface border border-olive-700/30 text-xs font-mono text-olive-300 hover:text-olive-100 transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: UPLOAD QR IMAGE FILE */}
            {mode === "file" && (
              <div className="space-y-4 py-3">
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-olive-700/50 hover:border-olive-400/80 rounded-xl p-8 text-center cursor-pointer bg-steel-900/40 hover:bg-steel-900/70 transition-all space-y-3"
                >
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                  <div className="h-12 w-12 mx-auto rounded-full bg-tactical-surface border border-olive-500/40 flex items-center justify-center text-olive-300">
                    <UploadCloud className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-olive-100">Click to upload or drag & drop QR image</p>
                    <p className="text-xs text-steel-400 mt-0.5">Supports PNG, JPG, WEBP photos of firearm tags or labels</p>
                  </div>
                  <button type="button" className="btn-secondary text-xs">
                    Browse Image
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: FIREARM DOSSIER & LOOKUP RESULT (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="glass rounded-xl p-4 sm:p-5 min-h-[460px] flex flex-col">
            <div className="flex items-center justify-between border-b border-olive-700/30 pb-3 mb-4">
              <p className="section-title flex items-center gap-2 m-0">
                <ShieldCheck className="h-4 w-4 text-olive-300" /> Firearm Dossier
              </p>
              {hit && (
                <button
                  onClick={() => {
                    setHit(null);
                    setManualInput("");
                  }}
                  className="btn-ghost text-xs p-1 text-steel-400 hover:text-olive-100 flex items-center gap-1"
                  title="Clear result"
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </button>
              )}
            </div>

            <AnimatePresence mode="wait">
              {hit ? (
                <motion.div
                  key={hit.equipment_id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="flex-1 flex flex-col justify-between space-y-4"
                >
                  {/* Firearm Header Details */}
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h2 className="text-xl font-bold text-olive-50 leading-tight">{hit.model}</h2>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="font-mono text-xs text-olive-200 bg-steel-800 px-2 py-0.5 rounded border border-olive-700/40">
                            SN: {hit.serial_number}
                          </span>
                          <button
                            onClick={() => copySerial(hit.serial_number)}
                            className="text-steel-400 hover:text-olive-100 p-1"
                            title="Copy Serial Number"
                          >
                            {copiedSerial ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`pill ${STATUSES[hit.availability_status]?.tone}`}>
                          {STATUSES[hit.availability_status]?.label}
                        </span>
                        <span className={`pill ${CONDITIONS[hit.condition_status]?.tone}`}>
                          {CONDITIONS[hit.condition_status]?.label}
                        </span>
                      </div>
                    </div>

                    {/* Custody Alert Banner */}
                    {isCheckedOut && activeTx ? (
                      <div className="rounded-lg p-3 border border-amber-600/30 bg-amber-950/20 text-xs space-y-1.5">
                        <div className="flex items-center gap-1.5 text-amber-300 font-semibold">
                          <User className="h-3.5 w-3.5" />
                          <span>Currently Issued To:</span>
                        </div>
                        <p className="text-sm font-bold text-amber-100 pl-5">
                          {activeTx.user?.rank ? `${activeTx.user.rank} ` : ""}
                          {activeTx.user?.first_name} {activeTx.user?.last_name}
                        </p>
                        <div className="flex items-center gap-3 pl-5 text-[11px] text-steel-400">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" /> Due: {new Date(activeTx.expected_return_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="rounded-lg p-2.5 border border-emerald-700/30 bg-emerald-950/20 text-xs flex items-center gap-2 text-emerald-300">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                        <span>Secured in Armory · Available for Assignment</span>
                      </div>
                    )}

                    {/* Specifications Grid */}
                    <div className="grid grid-cols-2 gap-2.5 p-3 rounded-lg bg-steel-900/60 border border-olive-700/30 text-xs">
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-olive-300">Manufacturer</dt>
                        <dd className="font-semibold text-steel-200 mt-0.5">{hit.manufacturer}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-olive-300">Caliber</dt>
                        <dd className="font-semibold text-steel-200 mt-0.5">{hit.caliber || "N/A"}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-olive-300">Category</dt>
                        <dd className="font-semibold text-steel-200 mt-0.5">{hit.category?.category_name || "Standard Issue"}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-wider text-olive-300">Armory Location</dt>
                        <dd className="font-semibold text-steel-200 mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-olive-400" />
                          {hit.current_location?.location_name || "Central Armory"}
                        </dd>
                      </div>
                    </div>
                  </div>

                  {/* Operational Action Buttons */}
                  <div className="space-y-2 pt-2 border-t border-olive-700/20">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => router.push(`/transactions/new?equipment_id=${hit.equipment_id}`)}
                        className="btn-primary text-xs py-2 flex items-center justify-center gap-1.5"
                      >
                        <span>{isCheckedOut ? "Process Return" : "Issue Firearm"}</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>

                      <button
                        onClick={() => router.push(`/firearms/${hit.equipment_id}`)}
                        className="btn-secondary text-xs py-2 flex items-center justify-center gap-1.5"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Full Record</span>
                      </button>
                    </div>

                    <button
                      onClick={() => router.push(`/maintenance`)}
                      className="btn-ghost text-xs w-full py-1.5 flex items-center justify-center gap-1.5 text-steel-400 hover:text-olive-200"
                    >
                      <Wrench className="h-3 w-3" />
                      <span>Log Maintenance Record</span>
                    </button>
                  </div>
                </motion.div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <div className="h-16 w-16 rounded-full bg-steel-900 border border-olive-700/40 flex items-center justify-center text-olive-400/60 shadow-inner">
                    <ScanLine className="h-8 w-8 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-olive-100">Awaiting Target Acquisition</h3>
                    <p className="text-xs text-steel-400 mt-1 max-w-xs">
                      Align the QR code sticker within the optical reticle, type the serial number, or trigger your handheld barcode scanner.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-steel-500 font-mono pt-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-olive-400 animate-ping" />
                    SYSTEM SENSORS ARMED
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* RECENT SCANS HISTORY TABLE */}
      {recentScans.length > 0 && (
        <div className="glass rounded-xl p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-olive-300" />
              <h3 className="text-sm font-bold text-olive-100">Recent Scans (Current Session)</h3>
              <span className="pill pill-tactical text-[10px]">{recentScans.length} logged</span>
            </div>
            <button onClick={() => setRecentScans([])} className="btn-ghost text-xs py-1 px-2 text-steel-400 hover:text-red-400">
              Clear History
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="table-auto w-full text-xs">
              <thead>
                <tr className="border-b border-olive-700/30 text-[10px] uppercase tracking-wider text-olive-300 text-left">
                  <th className="py-2 px-3">Time</th>
                  <th className="py-2 px-3">Serial Number</th>
                  <th className="py-2 px-3">Model</th>
                  <th className="py-2 px-3">Status</th>
                  <th className="py-2 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-olive-700/20">
                {recentScans.map((scan) => (
                  <tr key={`${scan.equipment_id}-${scan.timestamp}`} className="hover:bg-steel-850/50 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-steel-400">{scan.timestamp}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-olive-100">{scan.serial_number}</td>
                    <td className="py-2.5 px-3 text-steel-300">{scan.model}</td>
                    <td className="py-2.5 px-3">
                      <span className={`pill ${STATUSES[scan.availability_status]?.tone}`}>{STATUSES[scan.availability_status]?.label}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => {
                          setHit(scan.data);
                          toast.info(`Loaded ${scan.serial_number}`);
                        }}
                        className="btn-ghost text-xs py-1 px-2 text-olive-300 hover:text-olive-100"
                      >
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
