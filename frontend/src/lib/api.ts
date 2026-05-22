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

// Retry-on-429 backoff. The backend enforces a strict 5 req/s limit per user;
// React Strict Mode in dev and bursty mounts (multiple components hitting the
// same endpoint at once) can briefly trip it. Rather than surface those as
// errors, retry once with an exponential backoff respecting the Retry-After
// header. Idempotent reads (GET) are also retried on transient network errors.
const MAX_RETRIES = 3;

function isRetryableNetworkError(error: AxiosError): boolean {
  // No response at all (CORS, connection reset, abort, etc.)
  if (!error.response) return true;
  return false;
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
    const config = error.config as (AxiosRequestConfig & { __retryCount?: number }) | undefined;
    const status = error.response?.status;

    // 401 → log out, same as before.
    if (typeof window !== "undefined" && status === 401) {
      Cookies.remove(TOKEN_COOKIE);
      Cookies.remove(USER_COOKIE);
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
      return Promise.reject(error);
    }

    if (!config) return Promise.reject(error);
    config.__retryCount = config.__retryCount ?? 0;

    const isGet = (config.method ?? "get").toLowerCase() === "get";
    const shouldRetry =
      config.__retryCount < MAX_RETRIES &&
      (status === 429 || status === 503 || (isGet && isRetryableNetworkError(error)));

    if (!shouldRetry) return Promise.reject(error);

    config.__retryCount += 1;
    const delay = computeRetryDelay(error, config.__retryCount);
    await new Promise((res) => setTimeout(res, delay));
    return api.request(config);
  }
);

export function persistAuth(token: string, user: unknown, ttlMinutes: number | null = 15) {
  const opts: Cookies.CookieAttributes = { sameSite: "strict" };
  if (ttlMinutes !== null && ttlMinutes > 0) {
    opts.expires = new Date(Date.now() + ttlMinutes * 60_000);
  } else {
    // No expiry — cookie persists until browser session ends or explicit logout
    opts.expires = 365; // 1 year as a practical "no expiry"
  }
  Cookies.set(TOKEN_COOKIE, token, opts);
  Cookies.set(USER_COOKIE, JSON.stringify(user), opts);
}

export function clearAuth() {
  Cookies.remove(TOKEN_COOKIE);
  Cookies.remove(USER_COOKIE);
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
