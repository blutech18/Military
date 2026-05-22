"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Fingerprint, Loader2, ShieldCheck, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { api, AuthUser } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

const BIOMETRIC_BRIDGE_URL = (process.env.NEXT_PUBLIC_BIOMETRIC_BRIDGE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");

type BiometricMode = "checking" | "bridge" | "demo";

export default function BiometricPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [scanning, setScanning] = useState(false);
  const [mode, setMode] = useState<BiometricMode>("checking");
  const successRef = useRef(false);
  const challenge = typeof window !== "undefined" ? sessionStorage.getItem("armory_challenge") : null;
  const username  = typeof window !== "undefined" ? sessionStorage.getItem("armory_username") : null;

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
        setMode(resp.ok ? "bridge" : "demo");
      })
      .catch(() => {
        if (active) setMode("demo");
      })
      .finally(() => clearTimeout(timeout));

    return () => {
      active = false;
      controller.abort();
      clearTimeout(timeout);
    };
  }, []);

  async function capture() {
    setScanning(true);
    const { template, source } = await captureFingerprintTemplate(username, challenge, mode);

    try {
      const { data } = await api.post<{
        token: string;
        token_type: string;
        expires_in: number;
        user: AuthUser;
      }>("/auth/biometric/verify", {
        challenge_token: challenge,
        fingerprint: template,
        source,
      });

      successRef.current = true;
      setSession(data.token, data.user, data.expires_in != null ? Math.max(1, Math.round(data.expires_in / 60)) : null);
      sessionStorage.removeItem("armory_challenge");
      sessionStorage.removeItem("armory_username");
      sessionStorage.removeItem("armory_next_step");
      sessionStorage.removeItem("armory_totp_enabled");
      sessionStorage.removeItem("armory_biometric_enrolled");

      toast.success(`Welcome, ${data.user.full_name}.`);
      // Hard-navigate so cookies and the rehydrated auth store are guaranteed in sync
      // before the (authed)/layout reads them.
      window.location.assign("/dashboard");
      // Intentionally NOT setting scanning to false here so the UI stays in a loading state
      // while the browser navigates.
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Biometric verification failed.");
      setScanning(false);
    }
  }

  const bridgeAvailable = mode === "bridge";
  const statusText = mode === "checking"
    ? "Checking scanner bridge..."
    : bridgeAvailable
      ? "Futronic bridge online - using live scanner capture."
      : "Scanner bridge offline - using demo placeholder template.";

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
            : "Real scanner capture is unavailable, so this login will use the prototype placeholder flow."}
        </p>

        <div className={`mb-5 rounded-md border px-3 py-2 text-xs flex items-start gap-2 text-left ${
          bridgeAvailable
            ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-200"
            : "border-amber-700/40 bg-amber-900/20 text-amber-200"
        }`}>
          {bridgeAvailable ? <ShieldCheck className="h-4 w-4 shrink-0" /> : <WifiOff className="h-4 w-4 shrink-0" />}
          <div>
            <p className="font-semibold">{bridgeAvailable ? "Live Biometric Mode" : "Placeholder Biometric Mode"}</p>
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

        <button onClick={capture} disabled={scanning} className="btn-primary w-full mt-8">
          {scanning ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {bridgeAvailable ? "Capturing…" : "Verifying Demo…"}</>
          ) : bridgeAvailable ? "Capture Fingerprint" : "Use Demo Placeholder"}
        </button>

        <p className="mt-4 text-[11px] text-steel-500">
          Bridge URL: {BIOMETRIC_BRIDGE_URL}. When unavailable, the system clearly marks the flow as placeholder mode.
        </p>
      </motion.div>
    </div>
  );
}

async function captureFingerprintTemplate(
  username: string | null,
  challenge: string | null,
  mode: BiometricMode
): Promise<{ template: string; source: "futronic_bridge" | "demo_placeholder" }> {
  if (mode === "bridge") {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 30_000);
      const resp = await fetch(`${BIOMETRIC_BRIDGE_URL}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, challenge_token: challenge }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        throw new Error(`Bridge returned ${resp.status}`);
      }

      const data = await resp.json();
      const template = data.template ?? data.fingerprint ?? data.fingerprint_template;
      if (typeof template !== "string" || template.length < 32) {
        throw new Error("Bridge did not return a valid fingerprint template.");
      }

      return { template, source: "futronic_bridge" };
    } catch {
      toast.warning("Futronic bridge is unavailable. Falling back to demo placeholder mode.");
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }

  await new Promise((r) => setTimeout(r, 1400));
  return {
    template: `FUT-${username ?? "demo"}-fingerprint-template-fake-but-deterministic`,
    source: "demo_placeholder",
  };
}
