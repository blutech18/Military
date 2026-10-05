"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Fingerprint, Loader2 } from "lucide-react";
import { AxiosError } from "axios";
import { toast } from "sonner";
import { api, AuthUser } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import {
  BRIDGE_URL as BIOMETRIC_BRIDGE_URL,
  captureFingerprintTemplate,
  probeBridge,
  useBridgeProgress,
  type BridgeMode as BiometricMode,
} from "@/lib/biometric-bridge";


// Bridge capture timeouts (bridge.settings.json: 90 s enroll, 30 s verify) plus a margin.
// A scan is never started unless the sign-in session will outlive it.
const MIN_SECONDS_TO_ENROLL = 100;
const MIN_SECONDS_TO_VERIFY = 40;
// How long the "accepted" confirmation stays on screen before the dashboard opens.
const SUCCESS_DELAY_MS = 2200;
// After a rejected scan the button stays disabled briefly, so a wrong finger cannot be retried instantly.
const FAILURE_COOLDOWN_SECONDS = 3;
const SESSION_KEYS = [
  "armory_challenge",
  "armory_username",
  "armory_next_step",
  "armory_totp_enabled",
  "armory_biometric_enrolled",
  "armory_challenge_expires_at",
];

type Outcome =
  | { kind: "success"; title: string; detail: string }
  | { kind: "failed"; message: string };

export default function BiometricPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const [scanning, setScanning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [mode, setMode] = useState<BiometricMode>("checking");
  const successRef = useRef(false);
  const challenge = typeof window !== "undefined" ? sessionStorage.getItem("armory_challenge") : null;
  const username = typeof window !== "undefined" ? sessionStorage.getItem("armory_username") : null;
  // Set by the login/TOTP step: no fingerprint on file yet means this visit enrolls one.
  const enrolling = typeof window !== "undefined" && sessionStorage.getItem("armory_next_step") === "biometric_enroll";

  useEffect(() => { if (!challenge && !successRef.current) router.replace("/login"); }, [challenge, router]);

  // The server drops an unfinished sign-in after a few minutes. Say so, instead of failing on the next click.
  function endSession(message: string) {
    SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
    toast.error(message);
    router.replace("/login");
  }

  useEffect(() => {
    const stored = Number(sessionStorage.getItem("armory_challenge_expires_at"));
    if (!Number.isFinite(stored) || stored <= 0) return; // older session: the server's 419 is handled below

    const update = () => {
      const left = Math.ceil((stored - Date.now()) / 1000);
      setSecondsLeft(left);
      if (left <= 0 && !successRef.current) endSession("Your sign-in session expired. Please sign in again.");
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let active = true;
    probeBridge().then((result) => { if (active) setMode(result); });
    return () => { active = false; };
  }, []);

  // While a capture is running, mirror the bridge's touch-by-touch progress on screen.
  const progress = useBridgeProgress(scanning && mode === "bridge");

  async function capture() {
    if (mode !== "bridge" && mode !== "demo") return;

    if (mode === "bridge" && secondsLeft !== null && secondsLeft < (enrolling ? MIN_SECONDS_TO_ENROLL : MIN_SECONDS_TO_VERIFY)) {
      endSession("Not enough time left in this sign-in session to scan. Please sign in again.");
      return;
    }

    setOutcome(null);
    setScanning(true);
    try {
      const { template, source, captureSignature, capturedAt } = await captureFingerprintTemplate(username, challenge, mode, enrolling);
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
      // Show that the scan was accepted before moving on, instead of jumping straight to the dashboard.
      setOutcome({
        kind: "success",
        title: enrolling ? "Fingerprint registered" : "Fingerprint verified",
        detail: `Welcome, ${data.user.full_name}. Signing you in...`,
      });
      await new Promise((resolve) => setTimeout(resolve, SUCCESS_DELAY_MS));

      setSession(data.token, data.user, data.expires_in != null ? Math.max(1, Math.round(data.expires_in / 60)) : null);
      SESSION_KEYS.forEach((key) => sessionStorage.removeItem(key));
      window.location.assign("/dashboard");
    } catch (error: unknown) {
      if (error instanceof AxiosError && error.response?.status === 419) {
        endSession("Your sign-in session expired. Please sign in again.");
        return;
      }
      const message = error instanceof AxiosError
        ? error.response?.data?.message
        : error instanceof Error
          ? error.message
          : undefined;
      const text = message ?? "Biometric verification failed.";
      toast.error(text);
      setOutcome({ kind: "failed", message: text });
      setCooldown(FAILURE_COOLDOWN_SECONDS);
      setScanning(false);
    }
  }

  const bridgeAvailable = mode === "bridge";
  const succeeded = outcome?.kind === "success";
  const needed = progress?.touches_needed || (enrolling ? 4 : 1);
  const done = progress?.touches_done ?? 0;
  const phase = progress?.phase;
  const liveMessage = progress?.message
    ?? (enrolling ? `Place your finger on the reader (scan 1 of ${needed})` : "Place your finger on the reader");
  const phaseTone = phase === "poor"
    ? "text-amber-300"
    : phase === "good" || phase === "done"
      ? "text-emerald-300"
      : phase === "finger_on"
        ? "text-olive-100"
        : "text-steel-300";
  const iconTone = phase === "poor" ? "text-amber-300" : phase === "good" || phase === "done" ? "text-emerald-300" : "text-olive-300";
  const canCapture = bridgeAvailable || mode === "demo";
  const statusText = mode === "checking"
    ? "Checking scanner bridge..."
    : bridgeAvailable
      ? "DigitalPersona bridge online - using live scanner capture."
      : mode === "demo"
        ? "Scanner bridge offline - explicit demo mode permits a placeholder template."
        : "Scanner bridge is unavailable. Biometric sign-in is blocked until it reconnects.";

  return (
    <div className="min-h-[100dvh] w-full flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-x-hidden">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass w-full max-w-md rounded-2xl p-5 sm:p-6 text-center my-auto shadow-2xl transition-all max-h-[calc(100dvh-1.5rem)] overflow-y-auto"
      >
        <h2 className="text-xl sm:text-2xl font-bold text-olive-50">Fingerprint Verification</h2>
        <p className="text-xs sm:text-sm text-steel-400 mt-1 mb-3 sm:mb-4 leading-relaxed">
          {bridgeAvailable
            ? enrolling
              ? "First sign-in: enroll your fingerprint. Press Capture, then touch the U.are.U reader 4 times with the same finger, lifting it between touches."
              : "Press Capture, then place your enrolled finger on the U.are.U reader."
            : mode === "demo"
              ? "The development-only placeholder flow is active."
              : "A live scanner connection is required to continue."}
        </p>

        <div className={`mb-3 sm:mb-4 rounded-md border px-3 py-1.5 sm:py-2 text-xs text-center ${
          bridgeAvailable
            ? "border-emerald-700/40 bg-emerald-900/20 text-emerald-200"
            : "border-amber-700/40 bg-amber-900/20 text-amber-200"
        }`}>
          <p className="font-semibold text-xs">
            {bridgeAvailable ? "Live Biometric Mode" : mode === "demo" ? "Demo Biometric Mode" : "Scanner Unavailable"}
          </p>
          <p className="mt-0.5 text-[11px] sm:text-xs leading-relaxed">{statusText}</p>
        </div>

        <div className={`relative mx-auto rounded-full border-4 flex items-center justify-center overflow-hidden transition-all ${
          enrolling || needed > 1
            ? "h-28 w-28 sm:h-32 sm:w-32"
            : "h-32 w-32 sm:h-36 sm:w-36"
        } ${
          succeeded ? "border-emerald-400/70" : "border-olive-600/40"
        }`}>
          {succeeded
            ? <Check className={`${enrolling || needed > 1 ? "h-14 w-14 sm:h-16 sm:w-16" : "h-16 w-16 sm:h-20 sm:w-20"} text-emerald-300`} />
            : <Fingerprint className={`transition-colors ${enrolling || needed > 1 ? "h-16 w-16 sm:h-20 sm:w-20" : "h-20 w-20 sm:h-22 sm:w-22"} ${iconTone}`} />}
          {scanning && !succeeded && (
            <>
              <div className="absolute inset-0 rounded-full ring-pulse" />
              <div className="absolute left-0 right-0 h-1 bg-olive-300/70 animate-scan-line shadow-[0_0_18px_4px_rgba(174,183,113,0.6)]" />
            </>
          )}
        </div>

        {scanning && bridgeAvailable && !outcome && (
          <div className="mt-3 sm:mt-4" aria-live="polite">
            {needed > 1 && (
              <>
                <div className="flex items-center justify-center gap-2 sm:gap-2.5">
                  {Array.from({ length: needed }, (_, i) => {
                    const filled = i < done;
                    const current = i === done;
                    const tone = filled
                      ? "border-emerald-400 bg-emerald-500/20 text-emerald-200"
                      : current
                        ? phase === "poor"
                          ? "border-amber-400 text-amber-200"
                          : phase === "finger_on"
                            ? "border-olive-300 bg-olive-500/20 text-olive-50 animate-pulse"
                            : "border-olive-400/70 text-olive-200"
                        : "border-steel-600/50 text-steel-500";
                    return (
                      <span
                        key={i}
                        className={`flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border-2 text-[11px] sm:text-xs font-bold transition-all ${tone}`}
                      >
                        {filled ? <Check className="h-3.5 w-3.5" /> : i + 1}
                      </span>
                    );
                  })}
                </div>
                <p className="mt-2 text-[11px] sm:text-xs uppercase tracking-wider text-steel-400">
                  Scan {Math.min(done + 1, needed)} of {needed}
                </p>
              </>
            )}
            <p className={`mt-1 text-xs sm:text-sm font-medium ${phaseTone}`}>{liveMessage}</p>
          </div>
        )}

        {outcome?.kind === "success" && (
          <div className="mt-3 sm:mt-4" role="status" aria-live="polite">
            <p className="text-base sm:text-lg font-semibold text-emerald-300">{outcome.title}</p>
            <p className="mt-0.5 text-xs sm:text-sm text-emerald-100/80">{outcome.detail}</p>
            <div className="mx-auto mt-2.5 h-1 w-36 overflow-hidden rounded-full bg-emerald-900/50">
              <motion.div
                className="h-full bg-emerald-400"
                initial={{ width: 0 }}
                animate={{ width: "100%" }}
                transition={{ duration: SUCCESS_DELAY_MS / 1000, ease: "linear" }}
              />
            </div>
          </div>
        )}

        {outcome?.kind === "failed" && (
          <div className="mt-3 sm:mt-4 rounded-md border border-red-700/40 bg-red-900/20 px-3 py-1.5 text-xs text-red-200" role="alert">
            {outcome.message}
          </div>
        )}

        <button onClick={capture} disabled={scanning || !canCapture || cooldown > 0} className="btn-primary w-full mt-4 sm:mt-5 py-2.5 text-sm">
          {scanning ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> {succeeded ? "Signing you in…" : bridgeAvailable ? (needed > 1 ? `Scan ${Math.min(done + 1, needed)} of ${needed}…` : "Touch the reader…") : "Verifying Demo…"}</>
          ) : cooldown > 0 ? `Try again in ${cooldown}s` : bridgeAvailable ? (enrolling ? "Enroll Fingerprint" : "Capture Fingerprint") : mode === "demo" ? "Use Demo Placeholder" : mode === "checking" ? "Checking Scanner…" : "Scanner Required"}
        </button>

        {secondsLeft !== null && secondsLeft > 0 && (
          <p className={`mt-2 sm:mt-2.5 text-[11px] sm:text-xs ${secondsLeft <= 60 ? "text-amber-300" : "text-steel-400"}`}>
            Sign-in session expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </p>
        )}

        <p className="mt-2 text-[10px] sm:text-[11px] text-steel-500 leading-tight">
          Bridge URL: {BIOMETRIC_BRIDGE_URL}. Placeholder capture is available only when demo mode is explicitly enabled.
        </p>
      </motion.div>
    </div>
  );
}
