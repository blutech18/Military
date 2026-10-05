"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { decodeQrFromImageData, preloadQrDecoder } from "@/lib/qr-decoder";

export interface QrCameraOption {
  id: string;
  label: string;
}

interface UseQrCameraOptions {
  /** DOM id of the element the camera preview is rendered into. */
  viewportId: string;
  /** The camera runs only while this is true (e.g. the Live Camera tab is open). */
  active?: boolean;
  onDecode: (text: string) => void | Promise<void>;
  /** Ignore the same decoded text if it repeats within this window. */
  dedupeMs?: number;
}

/** Longest side, in pixels, of the frame handed to the decoder. */
const DECODE_LONG_SIDE = 1280;
/** Every few attempts the decoder gets a larger frame, which helps with small or distant codes. */
const DECODE_LONG_SIDE_LARGE = 1920;
const DECODE_INTERVAL_MS = 100;

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

interface RunningCamera {
  stop: () => void;
}

/**
 * Drives a live QR camera: owns the video stream and the decode loop.
 *
 * Frames are decoded at their true aspect ratio and resolution. The previous implementation used
 * html5-qrcode, which squeezes the whole video frame into the on-screen preview box before
 * decoding. A phone held upright delivers a portrait frame (about 1080x1920) and the preview is a
 * landscape box, so the QR arrived tiny and stretched, and scanning failed even when the code was
 * large and sharp in the preview.
 *
 * Starting and stopping are queued on one promise chain, so a stop always waits for a start that
 * is still in flight and then releases it; a camera that finishes starting after its cleanup has
 * run is stopped immediately instead of being left on.
 */
export function useQrCamera({ viewportId, active = true, onDecode, dedupeMs = 3000 }: UseQrCameraOptions) {
  const runningRef = useRef<RunningCamera | null>(null);
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const lastScanRef = useRef<{ text: string; time: number }>({ text: "", time: 0 });
  const onDecodeRef = useRef(onDecode);
  useEffect(() => {
    onDecodeRef.current = onDecode;
  }, [onDecode]);

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
    preloadQrDecoder();

    enqueue(async () => {
      if (cancelled) return;

      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setScanning(false);
        setCameraError(INSECURE_CONTEXT_MESSAGE);
        return;
      }
      const viewport = document.getElementById(viewportId);
      if (!viewport) return;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            ...(cameraId ? { deviceId: { exact: cameraId } } : { facingMode: { ideal: "environment" } }),
            // The default stream is low resolution, which turns a dense QR into mush. Ask for HD
            // and continuous autofocus; browsers that cannot honour either simply ignore them.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            advanced: [{ focusMode: "continuous" } as MediaTrackConstraintSet],
          },
        });
      } catch (err) {
        if (cancelled) return;
        console.error("Camera error:", err);
        setScanning(false);
        setCameraError(describeCameraError(err));
        return;
      }

      // Stopped while the permission prompt or camera start was pending: release it right away.
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.setAttribute("playsinline", "");
      video.setAttribute("muted", "");
      video.autoplay = true;
      video.srcObject = stream;
      viewport.replaceChildren(video); // sized by the #...-viewport video rules in globals.css

      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d", { willReadFrequently: true });
      let timer: ReturnType<typeof setTimeout> | null = null;
      let stopped = false;
      let busy = false;
      let tick = 0;

      const decodeFrame = async () => {
        if (stopped || busy || !context || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
        busy = true;
        try {
          // Alternate normal and large frames; both keep the true aspect ratio.
          const longSide = tick++ % 4 === 3 ? DECODE_LONG_SIDE_LARGE : DECODE_LONG_SIDE;
          const scale = Math.min(1, longSide / Math.max(video.videoWidth, video.videoHeight));
          const width = Math.max(1, Math.round(video.videoWidth * scale));
          const height = Math.max(1, Math.round(video.videoHeight * scale));
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          context.drawImage(video, 0, 0, width, height);
          const text = await decodeQrFromImageData(context.getImageData(0, 0, width, height));
          if (text && !stopped) {
            const now = Date.now();
            if (text === lastScanRef.current.text && now - lastScanRef.current.time < dedupeMs) return;
            lastScanRef.current = { text, time: now };
            await onDecodeRef.current(text);
          }
        } catch (err) {
          console.warn("QR decode attempt failed:", err);
        } finally {
          busy = false;
        }
      };

      const loop = () => {
        if (stopped) return;
        void decodeFrame().finally(() => {
          if (!stopped) timer = setTimeout(loop, DECODE_INTERVAL_MS);
        });
      };

      const running: RunningCamera = {
        stop: () => {
          stopped = true;
          if (timer) clearTimeout(timer);
          stream.getTracks().forEach((track) => track.stop());
          video.pause();
          video.srcObject = null;
          video.remove();
        },
      };
      runningRef.current = running;

      try {
        await video.play();
      } catch (err) {
        if (cancelled) return; // the teardown queued by the cleanup releases the stream
        console.error("Camera error:", err);
        running.stop();
        runningRef.current = null;
        setScanning(false);
        setCameraError(describeCameraError(err));
        return;
      }
      if (cancelled) return;

      setScanning(true);
      loop();

      try {
        setActiveCameraId(stream.getVideoTracks()[0]?.getSettings().deviceId ?? "");
        // Labels are only populated once permission is granted, so list cameras after the start.
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
        if (!cancelled) {
          setCameras(devices.map((d, i) => ({ id: d.deviceId, label: d.label || `Camera ${i + 1}` })));
        }
      } catch {
        // The camera list is optional; scanning already works.
      }
    });

    return () => {
      cancelled = true;
      enqueue(async () => {
        runningRef.current?.stop();
        runningRef.current = null;
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
