"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface QrCameraOption {
  id: string;
  label: string;
}

interface UseQrCameraOptions {
  /** DOM id of the element html5-qrcode renders the video into. */
  viewportId: string;
  /** The camera runs only while this is true (e.g. the Live Camera tab is open). */
  active?: boolean;
  onDecode: (text: string) => void | Promise<void>;
  /** Ignore the same decoded text if it repeats within this window. */
  dedupeMs?: number;
}

function describeCameraError(err: unknown): string {
  const text = `${(err as any)?.name ?? ""} ${(err as any)?.message ?? String(err)}`;
  if (/NotAllowed|Permission/i.test(text)) {
    return "Camera permission denied. Allow camera access in the browser's site settings, then retry.";
  }
  if (/NotReadable|in use|Could not start video source/i.test(text)) {
    return "The camera is being used by another app or browser tab. Close it, then retry.";
  }
  if (/NotFound|Overconstrained|no camera/i.test(text)) {
    return "No camera was found on this device.";
  }
  return "Could not start the camera. Check that it is connected, then retry.";
}

const INSECURE_CONTEXT_MESSAGE =
  "Browsers only allow camera access on HTTPS or http://localhost. Open this app at http://localhost:3000 on this computer, or serve it over HTTPS.";

/**
 * Drives an html5-qrcode live camera.
 *
 * Starting and stopping are queued on one promise chain, so a stop always waits for a start that is
 * still in flight and then releases it. Without that, a camera that finished starting after its
 * cleanup had already run was never stopped: the webcam stayed on and blocked the next start.
 */
export function useQrCamera({ viewportId, active = true, onDecode, dedupeMs = 3000 }: UseQrCameraOptions) {
  const scannerRef = useRef<any>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const lastScanRef = useRef<{ text: string; time: number }>({ text: "", time: 0 });
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

  // html5-qrcode calls video.play() without handling its rejection. Stopping a camera that is still
  // starting makes that promise reject with this AbortError; it is expected and harmless.
  useEffect(() => {
    const ignoreInterruptedPlay = (event: PromiseRejectionEvent) => {
      const reason = event.reason as { name?: string; message?: string } | undefined;
      if (reason?.name === "AbortError" && /play\(\) request was interrupted/i.test(reason.message ?? "")) {
        event.preventDefault();
      }
    };
    window.addEventListener("unhandledrejection", ignoreInterruptedPlay);
    return () => window.removeEventListener("unhandledrejection", ignoreInterruptedPlay);
  }, []);

  const [paused, setPaused] = useState(false);
  const [cameraId, setCameraId] = useState(""); // "" = browser default (rear camera on phones)
  const [activeCameraId, setActiveCameraId] = useState("");
  const [cameras, setCameras] = useState<QrCameraOption[]>([]);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    if (!active || paused) {
      setScanning(false);
      return;
    }

    let cancelled = false;
    const enqueue = (task: () => Promise<void>) => {
      chainRef.current = chainRef.current.then(task).catch(() => {});
    };

    setCameraError(null);

    enqueue(async () => {
      if (cancelled) return;

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setScanning(false);
        setCameraError(INSECURE_CONTEXT_MESSAGE);
        return;
      }
      if (!document.getElementById(viewportId)) return;

      const { Html5Qrcode } = await import("html5-qrcode");
      if (cancelled) return;

      const scanner = new Html5Qrcode(viewportId);
      scannerRef.current = scanner;
      try {
        await scanner.start(
          cameraId ? cameraId : { facingMode: "environment" },
          { fps: 15 },
          async (decodedText: string) => {
            const now = Date.now();
            if (decodedText === lastScanRef.current.text && now - lastScanRef.current.time < dedupeMs) return;
            lastScanRef.current = { text: decodedText, time: now };
            await onDecodeRef.current(decodedText);
          },
          () => {
            // No QR code in this frame.
          }
        );
        if (cancelled) return; // the cleanup's queued teardown stops it right after this task

        setScanning(true);
        try {
          setActiveCameraId(scanner.getRunningTrackSettings()?.deviceId ?? "");
          // Labels are only populated once permission is granted, so list cameras after the start.
          const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
          if (!cancelled) {
            setCameras(devices.map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
          }
        } catch {
          // The camera list is optional; scanning already works.
        }
      } catch (err) {
        if (cancelled) return; // a deliberate stop interrupts the start; that is not a failure
        console.error("Camera error:", err);
        setScanning(false);
        setCameraError(describeCameraError(err));
      }
    });

    return () => {
      cancelled = true;
      enqueue(async () => {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        if (!scanner) return;
        try {
          // Always attempt the stop. Its isScanning flag only flips once the video surface is ready,
          // so trusting it skipped the stop for a camera that was still coming up and left it running.
          await scanner.stop();
        } catch {
          // Rejects when the scanner was never running, which is fine.
        }
        try {
          scanner.clear();
        } catch {}
      });
    };
  }, [active, paused, cameraId, retryTick, viewportId, dedupeMs]);

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => setPaused(false), []);
  const retry = useCallback(() => {
    setPaused(false);
    setRetryTick((n) => n + 1);
  }, []);

  return {
    scanning,
    cameraError,
    cameras,
    selectedCameraId: cameraId || activeCameraId,
    selectCamera: setCameraId,
    pause,
    resume,
    retry,
  };
}
