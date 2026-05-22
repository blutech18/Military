"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { KeyRound, QrCode, ShieldCheck, Loader2, Copy, RefreshCw, X } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { QRCodeSVG } from "qrcode.react";

interface SetupResponse { secret: string; otpauth: string; issuer: string }

export default function TotpPage() {
  const router = useRouter();
  const [code, setCode] = useState<string[]>(Array(6).fill(""));
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const [setup, setSetup] = useState<SetupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [ready, setReady] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [reregistering, setReregistering] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const successRef = useRef(false);
  const challengeRef = useRef(typeof window !== "undefined" ? sessionStorage.getItem("armory_challenge") : null);
  const nextStepRef = useRef(typeof window !== "undefined" ? sessionStorage.getItem("armory_next_step") : null);
  const challenge = challengeRef.current;
  const isVerifyMode = nextStepRef.current === "totp";

  useEffect(() => {
    if (!challenge && !successRef.current) {
      router.replace("/login");
      return;
    }
    if (isVerifyMode) {
      setReady(true);
      return;
    }
    setLoading(true);
    api.post<SetupResponse>("/auth/totp/setup", { challenge_token: challenge })
      .then(({ data }) => { setSetup(data); setReady(true); })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [challenge, isVerifyMode, router]);

  function setDigit(i: number, v: string) {
    const value = v.replace(/\D/g, "").slice(0, 1);
    setCode((prev) => prev.map((c, idx) => (idx === i ? value : c)));
    if (value && i < 5) inputs.current[i + 1]?.focus();
  }

  async function submit() {
    const joined = code.join("");
    if (joined.length !== 6) {
      toast.warning("Enter the 6-digit code from Google Authenticator.");
      return;
    }
    setVerifying(true);
    try {
      const { data } = await api.post("/auth/totp/verify", { challenge_token: challenge, code: joined });

      // If biometric is disabled, the backend finalizes login and returns a token
      if (data.token && data.user) {
        successRef.current = true;
        setNavigating(true);
        const { useAuthStore } = await import("@/store/auth");
        const { setSession } = useAuthStore.getState();
        setSession(data.token, data.user, data.expires_in != null ? Math.max(1, Math.round(data.expires_in / 60)) : null);
        sessionStorage.removeItem("armory_challenge");
        sessionStorage.removeItem("armory_username");
        sessionStorage.removeItem("armory_next_step");
        sessionStorage.removeItem("armory_totp_enabled");
        sessionStorage.removeItem("armory_biometric_enrolled");
        toast.success(`Welcome, ${data.user.full_name}.`);
        window.location.assign("/dashboard");
        return;
      }

      toast.success("TOTP verified.");
      setNavigating(true);
      router.push("/login/biometric");
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Invalid code.");
    } finally {
      if (!successRef.current) setVerifying(false);
    }
  }

  async function handleReRegister() {
    if (!challenge) return;
    setReregistering(true);
    try {
      const { data } = await api.post<SetupResponse>("/auth/totp/setup", { challenge_token: challenge });
      setSetup(data);
      setShowQrModal(true);
    } catch {
      toast.error("Failed to generate a new secret. Please restart login.");
    } finally {
      setReregistering(false);
    }
  }

  function pasteCode(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, 6).split("");
    setCode((prev) => prev.map((_, i) => digits[i] ?? ""));
    inputs.current[Math.min(digits.length, 5)]?.focus();
  }

  /* ── Shared QR + Secret card ── */
  function QrSetupCard({ data }: { data: SetupResponse }) {
    return (
      <>
        <p className="text-xs text-steel-400 mb-4">
          Scan this QR code with Google Authenticator (or any TOTP app), or copy the secret manually.
        </p>
        <div className="flex justify-center mb-4">
          <div className="bg-white rounded-lg p-3">
            <QRCodeSVG value={data.otpauth} size={180} level="M" />
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 rounded-md bg-steel-900/60 border border-steel-700/40 px-3 py-2">
          <span className="text-xs font-mono text-olive-200 truncate">{data.secret}</span>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(data.secret); toast.success("Secret copied!"); }}
            className="btn-ghost p-1 shrink-0"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      {navigating && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-steel-950">
          <Loader2 className="h-8 w-8 animate-spin text-olive-300" />
        </div>
      )}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        className={`glass w-full rounded-2xl p-8 ${setup && !isVerifyMode ? "max-w-3xl" : "max-w-md"}`}
      >
        <h2 className="text-2xl font-bold text-olive-50 text-center">Google Authenticator</h2>
        <p className="text-sm text-steel-400 mb-6 text-center">
          Enter the 6-digit code refreshed every 30 seconds.
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-steel-300 justify-center"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
        )}

        {ready && (
          <div className={`${setup && !isVerifyMode ? "grid md:grid-cols-2 gap-6" : "space-y-6"}`}>
            {/* Left column: QR setup */}
            {setup && !isVerifyMode && (
              <div className="rounded-md border border-olive-700/40 bg-steel-900/40 p-4">
                <p className="text-xs uppercase tracking-widest text-olive-300 mb-3 flex items-center gap-1.5">
                  <QrCode className="h-3.5 w-3.5" /> First-time setup
                </p>
                <QrSetupCard data={setup} />
                <p className="text-[11px] text-steel-500 mt-3 text-center">
                  Or use the online TOTP tool:{" "}
                  <a
                    href="https://totp.danhersam.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-olive-300 underline hover:text-olive-200"
                  >
                    totp.danhersam.com
                  </a>
                </p>
              </div>
            )}

            {/* Right column (or full width in verify mode): code input */}
            <div className="flex flex-col rounded-md border border-olive-700/40 bg-steel-900/40 p-4">
              <p className="text-xs uppercase tracking-widest text-olive-300 mb-3 flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5" /> Enter code
              </p>
              <p className="text-xs text-steel-400 mb-4">
                Open your authenticator app and enter the current 6-digit code to complete verification.
              </p>

              {/* Verify mode: show enrolled badge */}
              {isVerifyMode && (
                <div className="flex items-center justify-center gap-2 text-emerald-300 text-xs uppercase tracking-widest mb-4">
                  <ShieldCheck className="h-3.5 w-3.5" /> Authenticator enrolled
                </div>
              )}

              <div className="flex flex-col justify-center flex-1">
                <label className="block text-xs uppercase tracking-widest text-olive-300 mb-2 text-center">
                  6-digit code
                </label>
                <div
                  className="grid grid-cols-6 gap-2 sm:gap-3"
                  onPaste={(e) => { e.preventDefault(); pasteCode(e.clipboardData.getData("text")); }}
                >
                  {code.map((c, i) => (
                    <input
                      key={i}
                      ref={(el) => { inputs.current[i] = el; }}
                      inputMode="numeric"
                      maxLength={1}
                      value={c}
                      onChange={(e) => setDigit(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Backspace" && !code[i] && i > 0) inputs.current[i - 1]?.focus();
                      }}
                      className="input-field text-center text-xl sm:text-2xl font-mono h-12 sm:h-14 px-0"
                    />
                  ))}
                </div>
                <button onClick={submit} disabled={verifying} className="btn-primary w-full mt-6">
                  {verifying && <Loader2 className="h-4 w-4 animate-spin" />}
                  Verify Code
                </button>
                {isVerifyMode && (
                  <div className="flex justify-center mt-3">
                    <button
                      onClick={handleReRegister}
                      disabled={reregistering}
                      className="btn-ghost text-xs text-steel-400 hover:text-olive-200 flex items-center gap-1.5"
                    >
                      {reregistering ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                      Lost your secret? Re-register
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </motion.div>

      {/* Re-register QR Modal */}
      {typeof document !== "undefined" && createPortal(
        <AnimatePresence>
          {showQrModal && setup && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowQrModal(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                onClick={(e) => e.stopPropagation()}
                className="glass rounded-xl p-6 w-full max-w-sm space-y-4"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-olive-300">
                    <QrCode className="h-5 w-5" />
                    <h3 className="text-sm font-bold uppercase tracking-widest">New QR Code</h3>
                  </div>
                  <button onClick={() => setShowQrModal(false)} className="btn-ghost p-1">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <QrSetupCard data={setup} />
                <p className="text-[11px] text-steel-500 text-center">
                  A new secret has been generated. Scan this QR code, then close this dialog and enter the 6-digit code.
                </p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
