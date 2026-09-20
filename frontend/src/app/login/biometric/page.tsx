"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Fingerprint, Loader2, ShieldCheck, WifiOff } from "lucide-react";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { api, AuthUser } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

const BIOMETRIC_BRIDGE_URL = (process.env.NEXT_PUBLIC_BIOMETRIC_BRIDGE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

type BiometricMode = "checking" | "bridge" | "unavailable" | "demo";
type BiometricCapture = {
  template: string;
  source: "futronic_bridge" | "demo_placeholder";
  captureSignature?: string;
  capturedAt?: string;
};
type BridgeCaptureResponse = {
  template?: unknown;
  fingerprint?: unknown;
  fingerprint_template?: unknown;
  signature?: unknown;
  captured_at?: unknown;
};

export default function BiometricPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<BiometricMode>("checking");
  const successRef = useRef(false);
  const challenge = typeof window !== "undefined" ? sessionStorage.getItem("armory_challenge") : null;
  const username = typeof window !== "undefined" ? sessionStorage.getItem("armory_username") : null;

  useEffect(() => { if (!challenge && !successRef.current) router.replace("/login"); }, [challenge, router]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1500);

    fetch(`${BIOMETRIC_BRIDGE_URL}/health`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((resp) => {
        if (!active) return;
        setMode(resp.ok ? "bridge" : DEMO_MODE ? "demo" : "unavailable");
      })
      .catch(() => {
        if (active) setMode(DEMO_MODE ? "demo" : "unavailable");
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  async function capture() {
    if (mode !== "bridge" && mode !== "demo") return;

    setScanning(true);
    try {
      const { template, source, captureSignature, capturedAt } = await captureFingerprintTemplate(username, challenge, mode);
      const { data } = await api.post<{
        token: string;
        token_type: string;
        expires_in: number;
        user: AuthUser;
      }>("/auth/biometric/verify", {
        challenge_token: challenge,
        fingerprint: template,
        source,
        capture_signature: captureSignature,
        captured_at: capturedAt,
      });

      successRef.current = true;
      setSession(data.token, data.user, data.expires_in != null ? Math.max(1, Math.round(data.expires_in / 60)) : null);
      sessionStorage.removeItem("armory_challenge");
      sessionStorage.removeItem("armory_username");
      sessionStorage.removeItem("armory_next_step");
      sessionStorage.removeItem("armory_totp_enabled");
      sessionStorage.removeItem("armory_biometric_enrolled");

      toast.success(`Welcome, ${data.user.full_name}.`);
      window.location.assign("/dashboard");
    } catch (error: unknown) {
      const message = error instanceof AxiosError
        ? error.response?.data?.message
        : error instanceof Error
          ? error.message
          : undefined;
      toast.error(message ?? "Biometric verification failed.");
      setScanning(false);
    }
  }

  const bridgeAvailable = mode === "bridge";
  const canCapture = bridgeAvailable || mode === "demo";
  const statusText = mode === "checking"
    ? "Checking scanner bridge..."
    : bridgeAvailable
      ? "Futronic bridge online - using live scanner capture."
      : mode === "demo"
        ? "Scanner bridge offline - explicit demo mode permits a placeholder template."
        : "Scanner bridge is unavailable. Biometric sign-in is blocked until it reconnects.";

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass w-full max-w-md rounded-2xl p-8 text-center"
      >
        <h2 className="text-2xl font-bold text-olive-50">Fingerprint Verification</h2>
        <p className="text-sm text-steel-400 mb-8">
          {bridgeAvailable
            ? "Place your enrolled finger on the Futronic FS80H / FS88H scanner."
            : mode === "demo"
              ? "The development-only placeholder flow is active."
              : "A live scanner connection is required to continue."}
        </p>

        <div className={`mb-5 rounded-md border px-3 py-2 text-xs flex items-start gap-2 text-left ${
          bridgeAvailable
            ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-200"
            : "border-amber-700/40 bg-amber-900/20 text-amber-200"
        }`}>
          {bridgeAvailable ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
          <div>
            <p className="font-semibold">
              {bridgeAvailable ? "Live Biometric Mode" : mode === "demo" ? "Demo Biometric Mode" : "Scanner Unavailable"}
            </p>
            <p className="mt-0.5">{statusText}</p>
          </div>
        </div>

        <div className="relative mx-auto h-44 w-44 rounded-full border-4 border-olive-600/40 flex items-center justify-center overflow-hidden">
          <Fingerprint className="h-28 w-28 text-olive-300" />
          {scanning && (
            <>
              <div className="absolute inset-0 rounded-full ring-pulse" />
              <div className="absolute left-0 right-0 h-1 bg-olive-300/70 animate-scan-line shadow-[0_0_18px_4px_rgba(174,183,113,0.6)]" />
            </>
          )}
        </div>

        <button onClick={capture} disabled={scanning || !canCapture} className="btn-primary w-full mt-8">
          {scanning ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {bridgeAvailable ? "Capturing…" : "Verifying Demo…"}</>
          ) : bridgeAvailable ? "Capture Fingerprint" : mode === "demo" ? "Use Demo Placeholder" : mode === "checking" ? "Checking Scanner…" : "Scanner Required"}
        </button>

        <p className="mt-4 text-[11px] text-steel-500">
          Bridge URL: {BIOMETRIC_BRIDGE_URL}. Placeholder capture is available only when demo mode is explicitly enabled.
        </p>
      </motion.div>
    </div>
  );
}

async function captureFingerprintTemplate(
  username: string | null,
  challenge: string | null,
  mode: "bridge" | "demo"
): Promise<BiometricCapture> {
  if (mode === "demo") {
    await new Promise((resolve) => setTimeout(resolve, 1400));
    return {
      template: `FUT-${username ?? "demo"}-fingerprint-template-fake-but-deterministic`,
      source: "demo_placeholder",
    };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const resp = await fetch(`${BIOMETRIC_BRIDGE_URL}/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, challenge_token: challenge }),
      signal: controller.signal,
    });

    if (!resp.ok) {
      throw new Error(`Fingerprint scanner returned status ${resp.status}.`);
    }

    const data = await resp.json() as BridgeCaptureResponse;
    const template = data.template ?? data.fingerprint ?? data.fingerprint_template;
    if (typeof template !== "string" || template.length < 32) {
      throw new Error("Fingerprint scanner returned an invalid template.");
    }
    if (typeof data.signature !== "string" || !/^[a-f0-9]{64}$/i.test(data.signature)) {
      throw new Error("Fingerprint scanner returned an invalid attestation signature.");
    }
    if (typeof data.captured_at !== "string" || Number.isNaN(Date.parse(data.captured_at))) {
      throw new Error("Fingerprint scanner returned an invalid capture timestamp.");
    }

    return {
      template,
      source: "futronic_bridge",
      captureSignature: data.signature,
      capturedAt: data.captured_at,
    };
  } catch (error: unknown) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Fingerprint capture timed out. Check the scanner connection.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
