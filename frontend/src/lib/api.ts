import axios, { AxiosError, AxiosRequestConfig } from "axios";
import Cookies from "js-cookie";

export const TOKEN_COOKIE = "armorydb_token";
export const USER_COOKIE  = "armorydb_user";

const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";

export const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json", Accept: "application/json" },
  timeout: 15_000,
});

api.interceptors.request.use((config) => {
  const token = Cookies.get(TOKEN_COOKIE);
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

// Retry transient failures only for idempotent reads. Mutating requests must never
// be replayed automatically because the server may have committed the write even
// when the client did not receive the response.
const MAX_RETRIES = 3;
const SAFE_RETRY_METHODS = new Set(["get", "head", "options"]);

type RetryableRequestConfig = AxiosRequestConfig & { __retryCount?: number };

function isRetryableNetworkError(error: AxiosError): boolean {
  return !error.response && error.code !== "ERR_CANCELED";
}

function computeRetryDelay(error: AxiosError, attempt: number): number {
  const headers = error.response?.headers ?? {};
  const ra = Number((headers as Record<string, string>)["retry-after"]);
  if (Number.isFinite(ra) && ra > 0) {
    return Math.min(5_000, ra * 1000);
  }
  // Exponential with a small jitter, capped at 4 s.
  const base = Math.min(4_000, 250 * Math.pow(2, attempt));
  return base + Math.floor(Math.random() * 150);
}

api.interceptors.response.use(
  (resp) => resp,
  async (error: AxiosError<{ message?: string }>) => {
    const config = error.config as RetryableRequestConfig | undefined;
    const status = error.response?.status;

    if (typeof window !== "undefined" && status === 401) {
      removeAuthCookies();
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    if (!config) return Promise.reject(error);
    config.__retryCount = config.__retryCount ?? 0;

    const method = (config.method ?? "get").toLowerCase();
    const isSafeMethod = SAFE_RETRY_METHODS.has(method);
    const isTransientFailure = status === 429 || status === 503 || isRetryableNetworkError(error);
    const shouldRetry =
      isSafeMethod &&
      config.__retryCount < MAX_RETRIES &&
      isTransientFailure;

    if (!shouldRetry) return Promise.reject(error);

    config.__retryCount += 1;
    const delay = computeRetryDelay(error, config.__retryCount);
    await new Promise((res) => setTimeout(res, delay));
    return api.request(config);
  }
);

function authCookieAttributes(): Cookies.CookieAttributes {
  const secure = typeof window !== "undefined"
    ? window.location.protocol === "https:"
    : baseURL.startsWith("https://");

  return { sameSite: "strict", secure, path: "/" };
}

function removeAuthCookies() {
  const opts = authCookieAttributes();
  Cookies.remove(TOKEN_COOKIE, opts);
  Cookies.remove(USER_COOKIE, opts);
}

export function persistAuth(token: string, user: unknown, ttlMinutes: number | null = 15) {
  const opts = authCookieAttributes();
  if (ttlMinutes !== null && ttlMinutes > 0) {
    opts.expires = new Date(Date.now() + ttlMinutes * 60_000);
  } else {
    opts.expires = 365;
  }
  Cookies.set(TOKEN_COOKIE, token, opts);
  Cookies.set(USER_COOKIE, JSON.stringify(user), opts);
}

export function clearAuth() {
  removeAuthCookies();
}

export function readAuth(): { token?: string; user?: AuthUser } {
  const token = Cookies.get(TOKEN_COOKIE);
  const raw   = Cookies.get(USER_COOKIE);
  let user: AuthUser | undefined;
  if (raw) {
    try { user = JSON.parse(raw); } catch { user = undefined; }
  }
  return { token, user };
}

export interface AuthUser {
  user_id: number;
  username: string;
  full_name: string;
  email: string;
  rank: string;
  role: string | null;
  security_clearance: number;
  totp_enabled: boolean;
  biometric_enrolled: boolean;
  last_login_at?: string | null;
}
