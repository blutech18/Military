"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lock,
  User,
  AlertTriangle,
  Loader2,
  Eye,
  EyeOff,
  KeyRound,
  ArrowLeft,
  Mail,
  CheckCircle2,
} from "lucide-react";
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
  username?: string;
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
  recaptcha_action: string;
}

interface ForgotPasswordResponse {
  message: string;
  reset_token: string;
  masked_email: string;
}

interface VerifyResetCodeResponse {
  message: string;
  verified: boolean;
  username?: string;
}

interface ResetPasswordResponse {
  message: string;
  username?: string;
}

type RecaptchaApi = {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
};

const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
let recaptchaLoader: Promise<RecaptchaApi> | null = null;

function loadRecaptcha(): Promise<RecaptchaApi> {
  if (DEMO_MODE && !RECAPTCHA_SITE_KEY) {
    return Promise.reject(new Error("demo"));
  }

  if (!RECAPTCHA_SITE_KEY) {
    return Promise.reject(new Error("reCAPTCHA is not configured. Contact the system administrator."));
  }

  const existing = (window as Window & { grecaptcha?: RecaptchaApi }).grecaptcha;
  if (existing) return Promise.resolve(existing);
  if (recaptchaLoader) return recaptchaLoader;

  recaptchaLoader = new Promise<RecaptchaApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(RECAPTCHA_SITE_KEY)}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const api = (window as Window & { grecaptcha?: RecaptchaApi }).grecaptcha;
      if (api) resolve(api);
      else reject(new Error("reCAPTCHA failed to initialize."));
    };
    script.onerror = () => reject(new Error("reCAPTCHA could not be loaded."));
    document.head.appendChild(script);
  });

  return recaptchaLoader;
}

async function createRecaptchaToken(action: string): Promise<string> {
  if (DEMO_MODE && !RECAPTCHA_SITE_KEY) return "demo-recaptcha-bypass";

  const recaptcha = await loadRecaptcha();
  await new Promise<void>((resolve) => recaptcha.ready(resolve));
  return recaptcha.execute(RECAPTCHA_SITE_KEY, { action });
}

type AuthMode = "login" | "forgot_request" | "forgot_verify" | "forgot_new_password";

export default function LoginPage() {
  const router = useRouter();

  // Mode: login, forgot_request, or forgot_reset
  const [mode, setMode] = useState<AuthMode>("login");

  // Login form state
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showRecaptcha, setShowRecaptcha] = useState(false);
  const [loading, setLoading] = useState(false);

  // Forgot password form state
  const [resetIdentifier, setResetIdentifier] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [maskedEmail, setMaskedEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  // Countdown timer for resending reset code
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

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

  async function submitLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const recaptchaToken = showRecaptcha
        ? await createRecaptchaToken(authRequirements?.recaptcha_action ?? "login")
        : undefined;
      const { data } = await api.post<LoginResponse>("/auth/login", {
        username,
        password,
        recaptcha_token: recaptchaToken,
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
      sessionStorage.setItem("armory_username", data.username ?? (data.user?.username || username));
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
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        if (error.response?.status === 429 && error.response.data?.recaptcha_required) {
          setShowRecaptcha(true);
          toast.warning("Too many failed attempts. Additional verification is required to retry.");
        } else {
          toast.error(error.response?.data?.message ?? "Login failed.");
        }
      } else {
        toast.error(error instanceof Error ? error.message : "Login failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  // Step 1: Request reset code
  async function submitForgotRequest(e: React.FormEvent) {
    e.preventDefault();
    if (!resetIdentifier.trim()) {
      toast.warning("Please provide your username or email address.");
      return;
    }
    setForgotLoading(true);
    try {
      const { data } = await api.post<ForgotPasswordResponse>("/auth/forgot-password", {
        identifier: resetIdentifier.trim(),
      });
      setResetToken(data.reset_token);
      setMaskedEmail(data.masked_email);
      setResendCooldown(60);
      setResetCode("");
      setMode("forgot_verify");
      toast.success(data.message || "Verification code dispatched.");
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        toast.error(error.response?.data?.message ?? "Unable to request password reset.");
      } else {
        toast.error(error instanceof Error ? error.message : "Request failed.");
      }
    } finally {
      setForgotLoading(false);
    }
  }

  // Resend verification code
  async function handleResendCode() {
    if (resendCooldown > 0 || !resetIdentifier.trim()) return;
    setForgotLoading(true);
    try {
      const { data } = await api.post<ForgotPasswordResponse>("/auth/forgot-password", {
        identifier: resetIdentifier.trim(),
      });
      setResetToken(data.reset_token);
      setMaskedEmail(data.masked_email);
      setResendCooldown(60);
      toast.success(data.message || "A new verification code has been dispatched.");
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        toast.error(error.response?.data?.message ?? "Failed to resend code.");
      } else {
        toast.error("Failed to resend verification code.");
      }
    } finally {
      setForgotLoading(false);
    }
  }

  // Step 2: Verify 6-digit code before allowing new password input
  async function submitVerifyCode(e: React.FormEvent) {
    e.preventDefault();

    if (!resetCode.trim() || resetCode.trim().length !== 6) {
      toast.warning("Please enter the complete 6-digit verification code.");
      return;
    }

    setForgotLoading(true);
    try {
      const { data } = await api.post<VerifyResetCodeResponse>("/auth/verify-reset-code", {
        reset_token: resetToken,
        code: resetCode.trim(),
      });
      toast.success(data.message || "Code confirmed. You may now set your new password.");
      setMode("forgot_new_password");
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        toast.error(error.response?.data?.message ?? "Invalid or expired verification code.");
      } else {
        toast.error("Code verification failed.");
      }
    } finally {
      setForgotLoading(false);
    }
  }

  // Step 3: Set new password
  async function submitResetPassword(e: React.FormEvent) {
    e.preventDefault();

    if (newPassword.length < 10) {
      toast.warning("New password must be at least 10 characters long.");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("Password confirmation does not match.");
      return;
    }

    setForgotLoading(true);
    try {
      const { data } = await api.post<ResetPasswordResponse>("/auth/reset-password", {
        reset_token: resetToken,
        code: resetCode.trim(),
        new_password: newPassword,
        new_password_confirmation: confirmPassword,
      });

      toast.success(data.message || "Password updated successfully!");

      // Transition back to login prefilled with the username
      if (data.username) {
        setUsername(data.username);
      } else if (!resetIdentifier.includes("@")) {
        setUsername(resetIdentifier);
      }
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setConfirmPassword("");
      setMode("login");
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        toast.error(error.response?.data?.message ?? "Password reset failed.");
      } else {
        toast.error(error instanceof Error ? error.message : "Password reset failed.");
      }
    } finally {
      setForgotLoading(false);
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

      {/* Right — dynamic authentication panel */}
      <div className="flex items-center justify-center p-6">
        <div className="glass w-full max-w-md rounded-2xl p-8 overflow-hidden">
          <AnimatePresence mode="wait">
            {/* VIEW 1: SIGN IN */}
            {mode === "login" && (
              <motion.form
                key="login-form"
                onSubmit={submitLogin}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-olive-50">Authenticate</h2>
                  <p className="text-sm text-steel-400">Enter your credentials to begin.</p>
                </div>

                {/* Username or Email Input */}
                <label className="block text-xs uppercase tracking-widest text-olive-300 mb-1">
                  Username or Email
                </label>
                <div className="relative mb-4">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
                  <input
                    required
                    autoFocus
                    autoComplete="username"
                    className="input-field pl-9"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="username or email@domain.com"
                  />
                </div>

                {/* Password Input + Forgot Password Action */}
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs uppercase tracking-widest text-olive-300">
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (username) setResetIdentifier(username);
                      setMode("forgot_request");
                    }}
                    className="text-xs text-olive-400 hover:text-olive-200 transition-colors focus:outline-none underline-offset-4 hover:underline"
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative mb-2">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
                  <input
                    required
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    className="input-field pl-9 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-olive-300 transition-colors p-1"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {showRecaptcha && (
                  <div className="mt-3 mb-2 rounded-md border border-amber-700/40 bg-amber-900/20 p-3 text-xs text-amber-200 flex gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <div>
                      Multiple failed attempts detected. Google reCAPTCHA v3 will verify this retry when you submit.
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
            )}

            {/* VIEW 2: FORGOT PASSWORD - STEP 1 (REQUEST CODE) */}
            {mode === "forgot_request" && (
              <motion.form
                key="forgot-request-form"
                onSubmit={submitForgotRequest}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="inline-flex items-center gap-1.5 text-xs text-steel-400 hover:text-olive-300 transition-colors mb-4 focus:outline-none"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Back to Sign In</span>
                </button>

                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-olive-50">Account Recovery</h2>
                  <p className="text-sm text-steel-400 mt-1">
                    Enter your username or registered email address to receive an authentication code.
                  </p>
                </div>

                <label className="block text-xs uppercase tracking-widest text-olive-300 mb-1">
                  Username or Email
                </label>
                <div className="relative mb-6">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
                  <input
                    required
                    autoFocus
                    type="text"
                    className="input-field pl-9"
                    value={resetIdentifier}
                    onChange={(e) => setResetIdentifier(e.target.value)}
                    placeholder="username or email@domain.com"
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="btn-primary w-full"
                >
                  {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Request Recovery Code
                </button>

                <p className="mt-6 text-center text-[11px] text-steel-500">
                  Secured via cryptographic one-time token · 15 minute expiration
                </p>
              </motion.form>
            )}

            {/* VIEW 3: FORGOT PASSWORD - STEP 2 (CONFIRM 6-DIGIT CODE) */}
            {mode === "forgot_verify" && (
              <motion.form
                key="forgot-verify-form"
                onSubmit={submitVerifyCode}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >
                <button
                  type="button"
                  onClick={() => setMode("forgot_request")}
                  className="inline-flex items-center gap-1.5 text-xs text-steel-400 hover:text-olive-300 transition-colors mb-4 focus:outline-none"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  <span>Change Identifier</span>
                </button>

                <div className="mb-6">
                  <h2 className="text-2xl font-bold text-olive-50">Confirm Verification Code</h2>
                  <p className="text-sm text-steel-400 mt-1">
                    Enter the 6-digit authorization code dispatched to{" "}
                    <span className="font-mono text-olive-200">{maskedEmail || resetIdentifier}</span>.
                  </p>
                </div>


                {/* 6-digit Code Input */}
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs uppercase tracking-widest text-olive-300">
                    6-Digit Code
                  </label>
                  <button
                    type="button"
                    disabled={resendCooldown > 0 || forgotLoading}
                    onClick={handleResendCode}
                    className="text-[11px] text-olive-400 hover:text-olive-200 disabled:opacity-40 disabled:hover:text-olive-400 transition-colors focus:outline-none"
                  >
                    {resendCooldown > 0 ? `Resend code (${resendCooldown}s)` : "Resend code"}
                  </button>
                </div>
                <div className="relative mb-6">
                  <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
                  <input
                    required
                    autoFocus
                    maxLength={6}
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="input-field pl-9 font-mono tracking-widest text-base text-center"
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="••••••"
                  />
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading || resetCode.length !== 6}
                  className="btn-primary w-full disabled:opacity-50"
                >
                  {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Confirm Code
                </button>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-xs text-steel-400 hover:text-olive-300 transition-colors"
                  >
                    Cancel and return to Sign In
                  </button>
                </div>
              </motion.form>
            )}

            {/* VIEW 4: FORGOT PASSWORD - STEP 3 (SET NEW PASSWORD) */}
            {mode === "forgot_new_password" && (
              <motion.form
                key="forgot-new-password-form"
                onSubmit={submitResetPassword}
                initial={{ opacity: 0, x: 16 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }}
                transition={{ duration: 0.25 }}
              >
                <div className="mb-6">
                  <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-950/50 border border-emerald-700/40 text-emerald-300 text-[11px] mb-3 font-medium">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Identity Verified</span>
                  </div>
                  <h2 className="text-2xl font-bold text-olive-50">Set New Password</h2>
                  <p className="text-sm text-steel-400 mt-1">
                    Create a new secure password for{" "}
                    <span className="font-mono text-olive-200">{maskedEmail || resetIdentifier}</span>.
                  </p>
                </div>

                {/* New Password Input */}
                <label className="block text-xs uppercase tracking-widest text-olive-300 mb-1">
                  New Password
                </label>
                <div className="relative mb-4">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
                  <input
                    required
                    autoFocus
                    type={showNewPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className="input-field pl-9 pr-10 text-sm"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Min. 10 characters"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-olive-300 transition-colors p-1"
                    aria-label={showNewPassword ? "Hide password" : "Show password"}
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Confirm Password Input */}
                <label className="block text-xs uppercase tracking-widest text-olive-300 mb-1">
                  Confirm New Password
                </label>
                <div className="relative mb-6">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400" />
                  <input
                    required
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    className="input-field pl-9 pr-10 text-sm"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-steel-400 hover:text-olive-300 transition-colors p-1"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={forgotLoading}
                  className="btn-primary w-full"
                >
                  {forgotLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  Update Password & Sign In
                </button>

                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => setMode("login")}
                    className="text-xs text-steel-400 hover:text-olive-300 transition-colors"
                  >
                    Cancel and return to Sign In
                  </button>
                </div>
              </motion.form>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
