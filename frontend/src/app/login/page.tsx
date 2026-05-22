"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Lock, User, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AxiosError } from "axios";
import { BrandLogo } from "@/components/brand-logo";
import { useAuthStore } from "@/store/auth";

interface LoginResponse {
  message: string;
  challenge_token?: string;
  next?: "totp" | "totp_setup" | "biometric" | "biometric_enroll";
  totp_enabled?: boolean;
  biometric_enrolled?: boolean;
  // Present when both MFA methods are disabled (direct login)
  token?: string;
  token_type?: string;
  expires_in?: number;
  user?: import("@/lib/api").AuthUser;
}

interface AuthRequirements {
  totp_required: boolean;
  biometric_required: boolean;
  mfa_required: boolean;
}

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showRecaptcha, setShowRecaptcha] = useState(false);
  const [loading, setLoading] = useState(false);
  const { data: authRequirements, isLoading: loadingRequirements } = useQuery<AuthRequirements>({
    queryKey: ["auth-requirements"],
    queryFn: async () => (await api.get<AuthRequirements>("/auth/requirements")).data,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 5_000,
  });

  const mfaRequired = authRequirements?.mfa_required ?? false;
  const submitLabel = loadingRequirements
    ? "Checking sign-in..."
    : mfaRequired
      ? "Continue → MFA"
      : "Sign In";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post<LoginResponse>("/auth/login", {
        username,
        password,
        recaptcha_token: showRecaptcha ? "demo-recaptcha-bypass" : undefined,
      });

      // If both MFA methods are disabled, the backend returns a token directly
      if (data.token && data.user) {
        const { setSession } = useAuthStore.getState();
        setSession(data.token, data.user, data.expires_in != null ? Math.max(1, Math.round(data.expires_in / 60)) : null);
        toast.success(`Welcome, ${data.user.full_name}.`);
        window.location.assign("/dashboard");
        return;
      }

      // MFA required — store challenge and route to the correct step
      sessionStorage.setItem("armory_challenge", data.challenge_token!);
      sessionStorage.setItem("armory_username", username);
      sessionStorage.setItem("armory_next_step", data.next ?? "totp_setup");
      sessionStorage.setItem("armory_totp_enabled", data.totp_enabled ? "1" : "0");
      sessionStorage.setItem("armory_biometric_enrolled", data.biometric_enrolled ? "1" : "0");

      if (data.next === "biometric" || data.next === "biometric_enroll") {
        toast.success("Password verified — proceed to biometric.");
        router.push("/login/biometric");
      } else {
        toast.success("Password verified — proceed to MFA.");
        router.push("/login/totp");
      }
    } catch (err) {
      const e = err as AxiosError<{ message: string; recaptcha_required?: boolean }>;
      if (e.response?.status === 429 && e.response.data.recaptcha_required) {
        setShowRecaptcha(true);
        toast.warning("Too many failed attempts. Solve the challenge to retry.");
      } else {
        toast.error(e.response?.data?.message ?? "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left — brand panel */}
      <div className="hidden lg:flex relative items-center justify-center p-12 overflow-hidden border-r border-olive-700/30">
        <div className="absolute inset-0 bg-armory-radial" />
        <div className="absolute inset-0 bg-tactical-grid bg-[length:48px_48px] opacity-30" />
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative max-w-md text-center"
        >
          <div className="mx-auto mb-7 flex h-36 w-36 items-center justify-center">
            <BrandLogo size={132} className="object-contain" priority />
          </div>
          <h1 className="text-3xl font-bold tracking-tight text-olive-50">
            ArmoryDB
          </h1>
          <p className="mt-1 text-sm uppercase tracking-[0.4em] text-olive-300">
            10th RCDG · Reserve Command
          </p>
          <p className="mt-6 text-steel-300 leading-relaxed">
            Real-Time GPS Firearm Tracking & Management System.
            QR identification, biometric authentication, immutable audit trails.
          </p>

        </motion.div>
      </div>

      {/* Right — login form */}
      <div className="flex items-center justify-center p-6">
        <motion.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="glass w-full max-w-md rounded-2xl p-8"
        >
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-olive-50">Authenticate</h2>
            <p className="text-sm text-steel-400">Enter your credentials to begin.</p>
          </div>

          <label className="block text-xs uppercase tracking-widest text-olive-300 mb-1">Username</label>
          <div className="relative mb-4">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
            <input
              required
              autoFocus
              autoComplete="username"
              className="input-field pl-9"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. armory.custodian"
            />
          </div>

          <label className="block text-xs uppercase tracking-widest text-olive-300 mb-1">Password</label>
          <div className="relative mb-2">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
            <input
              required
              type="password"
              autoComplete="current-password"
              className="input-field pl-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {showRecaptcha && (
            <div className="mt-3 mb-2 rounded-md border border-amber-700/40 bg-amber-900/20 p-3 text-xs text-amber-200 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <div>
                Multiple failed attempts detected. In production, Google reCAPTCHA v3 will challenge you here.
                Click submit to retry.
              </div>
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full mt-6">
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitLabel}
          </button>

          <p className="mt-6 text-center text-[11px] uppercase tracking-widest text-steel-500">
            Authorized personnel only · all actions audited
          </p>
        </motion.form>
      </div>
    </div>
  );
}
