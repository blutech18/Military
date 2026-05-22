"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, Menu, Radio, Search, WifiOff, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import Cookies from "js-cookie";
import { api, TOKEN_COOKIE } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface TopbarProps {
  onMenuClick?: () => void;
}

type IotState = "online" | "partial" | "offline" | "unprovisioned";

interface IotStatusResponse {
  state: IotState;
  online_devices: number;
  expected_devices: number;
  total_devices: number;
  last_heartbeat_at: string | null;
  last_capture_at: string | null;
  online_window_sec: number;
  poll_interval_sec: number;
  server_time: string;
}

const NOTIF_POLL_MS = 10_000; // unread notifications

export function Topbar({ onMenuClick }: TopbarProps) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [searchQuery, setSearchQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const notif = useQuery({
    queryKey: ["unread-notifications"],
    queryFn: async () => (await api.get<{ count: number; items: any[] }>("/notifications/unread")).data,
    refetchInterval: NOTIF_POLL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    enabled: !!user,
  });
  const data = notif.data;

  // IoT connection indicator — pushed live over Server-Sent Events.
  // Falls back to fast polling if the stream is unavailable, so the indicator
  // is always responsive regardless of deployment environment.
  const iot = useIotStatusStream(!!user);

  // Snap-refresh notifications on tab focus / network reconnect so the bell
  // badge is fresh the moment the user comes back.
  useEffect(() => {
    if (!user) return;
    const wake = () => {
      if (document.visibilityState === "visible") {
        qc.invalidateQueries({ queryKey: ["unread-notifications"] });
      }
    };
    const online = () => qc.invalidateQueries({ queryKey: ["unread-notifications"] });
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", online);
    return () => {
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", online);
    };
  }, [qc, user]);

  const { data: searchResults } = useQuery({
    queryKey: ["global-search", searchQuery],
    queryFn: async () => (await api.get("/search", { params: { q: searchQuery } })).data,
    enabled: searchQuery.length >= 2,
  });

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const hasResults = searchResults && (
    searchResults.firearms?.length > 0 ||
    searchResults.users?.length > 0 ||
    searchResults.transactions?.length > 0
  );

  return (
    <>
      <header className="w-full h-16 sticky top-0 z-30 bg-steel-900 border-b border-olive-700/30 shrink-0 flex items-center px-4 lg:px-6 gap-3">
        {/* Mobile hamburger */}
        <button
          onClick={onMenuClick}
          className="lg:hidden btn-ghost p-2 shrink-0"
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        {/* Search — takes all available space */}
        <div className="relative flex-1 min-w-0" ref={searchRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-steel-400 pointer-events-none" />
          <input
            className="input-field pl-9 h-9 text-sm w-full"
            placeholder="Search firearms, personnel, transactions…"
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
            onFocus={() => setShowResults(true)}
          />
          {showResults && hasResults && (
            <div className="absolute top-full left-0 right-0 mt-1 glass rounded-lg shadow-xl max-h-80 overflow-y-auto z-50">
              {searchResults.firearms?.length > 0 && (
                <div className="p-2">
                  <p className="text-[10px] uppercase tracking-widest text-olive-300 px-2 py-1">Firearms</p>
                  {searchResults.firearms.map((f: any) => (
                    <Link key={f.equipment_id} href={`/firearms/${f.equipment_id}`}
                          onClick={() => setShowResults(false)}
                          className="block px-3 py-1.5 rounded hover:bg-steel-800/60 text-sm text-olive-100">
                      <span className="font-mono">{f.serial_number}</span> · {f.model}
                    </Link>
                  ))}
                </div>
              )}
              {searchResults.users?.length > 0 && (
                <div className="p-2 border-t border-olive-700/30">
                  <p className="text-[10px] uppercase tracking-widest text-olive-300 px-2 py-1">Personnel</p>
                  {searchResults.users.map((u: any) => (
                    <Link key={u.user_id} href="/users"
                          onClick={() => setShowResults(false)}
                          className="block px-3 py-1.5 rounded hover:bg-steel-800/60 text-sm text-olive-100">
                      {u.rank} {u.first_name} {u.last_name} <span className="text-steel-400">@{u.username}</span>
                    </Link>
                  ))}
                </div>
              )}
              {searchResults.transactions?.length > 0 && (
                <div className="p-2 border-t border-olive-700/30">
                  <p className="text-[10px] uppercase tracking-widest text-olive-300 px-2 py-1">Transactions</p>
                  {searchResults.transactions.map((t: any) => (
                    <Link key={t.transaction_id} href="/transactions"
                          onClick={() => setShowResults(false)}
                          className="block px-3 py-1.5 rounded hover:bg-steel-800/60 text-sm text-olive-100">
                      #{t.transaction_id} · {t.firearm?.serial_number} · <span className="text-steel-400">{t.status}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right side — fixed width, won't shrink */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <LiveIndicator pulse={notif.isFetching} stale={notif.isError} />
          <IotIndicator
            status={iot.status}
            isError={iot.isError}
            isLoading={iot.isLoading}
            isStreaming={iot.isStreaming}
          />

          <button onClick={() => setIsDrawerOpen(true)} className="relative btn-ghost p-2" aria-label="Notifications">
            <Bell className="h-4 w-4" />
            {data?.count ? (
              <span className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white px-1">
                {data.count}
              </span>
            ) : null}
          </button>

          <RealtimeAlertToast items={data?.items} />
        </div>
    </header>

      {/* Notifications Drawer */}
      {isDrawerOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          onClick={() => setIsDrawerOpen(false)}
        />
      )}
      
      <div
        className={cn(
          "fixed top-0 right-0 h-screen w-80 bg-steel-900 border-l border-olive-700/30 z-[70] shadow-2xl flex flex-col transition-transform duration-300 ease-in-out",
          isDrawerOpen ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-olive-700/30 shrink-0">
          <h2 className="text-sm font-bold text-olive-50">Notifications</h2>
          <button onClick={() => setIsDrawerOpen(false)} className="btn-ghost p-1.5 rounded-md">
            <X className="h-4 w-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {data?.items && data.items.length > 0 ? (
            data.items.map((n: any) => (
              <div key={n.notification_id} className="bg-steel-800/50 p-3 rounded-lg border border-olive-700/20">
                <p className="text-sm font-medium text-olive-100">{n.title}</p>
                <p className="text-xs text-steel-400 mt-1">{n.message}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-steel-500 text-center py-4">No new notifications</p>
          )}
        </div>
        
        <div className="p-4 border-t border-olive-700/30 shrink-0">
          <Link href="/notifications" onClick={() => setIsDrawerOpen(false)} className="w-full btn-primary py-2 flex items-center justify-center rounded-md text-sm font-medium">
            View All Notifications
          </Link>
        </div>
      </div>
    </>
  );
}

/** Shows toast for new critical/warning notifications as they arrive via polling */
function RealtimeAlertToast({ items }: { items?: any[] }) {
  const seenRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!items) return;
    for (const n of items) {
      if (!seenRef.current.has(n.notification_id) && (n.severity === "critical" || n.severity === "warning")) {
        seenRef.current.add(n.notification_id);
        if (seenRef.current.size > 1) {
          toast[n.severity === "critical" ? "error" : "warning"](n.title, { description: n.message, duration: 8000 });
        }
      }
    }
  }, [items]);

  return null;
}

/** Pulsing "Live" pill — green dot pulses on each refetch, dims if the stream is stale. */
function LiveIndicator({ pulse, stale }: { pulse: boolean; stale: boolean }) {
  const [flash, setFlash] = useState(false);

  // Briefly highlight whenever a refetch begins.
  useEffect(() => {
    if (!pulse) return;
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 600);
    return () => clearTimeout(t);
  }, [pulse]);

  if (stale) {
    return (
      <span
        className="hidden lg:inline-flex pill pill-warn"
        title="Real-time stream interrupted"
      >
        <span className="h-2 w-2 rounded-full bg-amber-400" />
        Reconnecting
      </span>
    );
  }

  return (
    <span
      className={cn(
        "hidden lg:inline-flex pill pill-tactical transition-colors",
        flash && "border-emerald-400/70 text-emerald-100"
      )}
      title="Real-time updates active"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
      </span>
      Live
    </span>
  );
}

/**
 * Live IoT status feed.
 *
 * Default: 3-second polling against `/gps/iot-status`. Works on every
 * deployment, including `php artisan serve` (which is single-threaded).
 *
 * Optional: enable Server-Sent Events by setting
 *   NEXT_PUBLIC_IOT_STREAM=1
 * in the frontend env. SSE pushes updates the moment the server sees a change,
 * but it requires a non-blocking PHP setup (php-fpm, Apache, or Octane).
 * `php artisan serve` cannot serve a long-lived stream alongside other
 * requests — it will return ERR_CONNECTION_RESET on every parallel call.
 *
 * In both modes a 1-second client ticker ages out the heartbeat locally,
 * so the pill flips to offline the moment the last known heartbeat exceeds
 * the online window — without waiting for the next event or poll.
 */
function useIotStatusStream(enabled: boolean): {
  status?: IotStatusResponse;
  isLoading: boolean;
  isError: boolean;
  isStreaming: boolean;
} {
  const [status, setStatus] = useState<IotStatusResponse | undefined>(undefined);
  const [isError, setIsError] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const esRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const retryRef = useRef(0);
  const backoffMsRef = useRef(0);

  useEffect(() => {
    if (!enabled) return;

    const streamEnabled =
      process.env.NEXT_PUBLIC_IOT_STREAM === "1" ||
      process.env.NEXT_PUBLIC_IOT_STREAM === "true";

    let cancelled = false;

    const stopStream = () => {
      esRef.current?.close();
      esRef.current = null;
      setIsStreaming(false);
    };

    const stopPolling = () => {
      if (pollRef.current) {
        clearTimeout(pollRef.current);
        pollRef.current = null;
      }
    };

    const fetchOnce = async () => {
      if (cancelled || inFlightRef.current) return;
      inFlightRef.current = true;
      try {
        const resp = await api.get<IotStatusResponse>("/gps/iot-status");
        if (cancelled) return;
        setStatus(resp.data);
        setIsError(false);
        setIsLoading(false);
        backoffMsRef.current = 0; // success — reset backoff
      } catch (err: any) {
        if (cancelled) return;
        const sc = err?.response?.status;
        if (sc === 429) {
          // Honor Retry-After if provided, otherwise apply exponential backoff
          // capped at 30 s. We do NOT mark isError — the indicator stays on
          // the last known good state until the next successful fetch.
          const retryAfter = Number(err?.response?.headers?.["retry-after"]);
          backoffMsRef.current = Number.isFinite(retryAfter) && retryAfter > 0
            ? Math.min(30_000, retryAfter * 1000)
            : Math.min(30_000, Math.max(2_000, backoffMsRef.current * 2 || 2_000));
        } else {
          setIsError(true);
          setIsLoading(false);
        }
      } finally {
        inFlightRef.current = false;
      }
    };

    const schedulePoll = () => {
      if (cancelled) return;
      stopPolling();
      // Default cadence 3 s, extended by any active backoff.
      const delay = Math.max(3_000, backoffMsRef.current);
      pollRef.current = setTimeout(async () => {
        await fetchOnce();
        schedulePoll();
      }, delay);
    };

    const startPolling = () => {
      stopStream();
      void fetchOnce().then(schedulePoll);
    };

    const startStream = () => {
      if (typeof window === "undefined" || typeof window.EventSource === "undefined") {
        startPolling();
        return;
      }

      const token = Cookies.get(TOKEN_COOKIE);
      if (!token) {
        startPolling();
        return;
      }

      const baseURL = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000/api/v1";
      const url = `${baseURL}/gps/iot-stream?token=${encodeURIComponent(token)}`;

      const es = new EventSource(url);
      esRef.current = es;

      es.addEventListener("open", () => {
        if (cancelled) return;
        retryRef.current = 0;
        setIsStreaming(true);
        setIsError(false);
        stopPolling(); // streaming wins
      });

      es.addEventListener("status", (event: MessageEvent) => {
        if (cancelled) return;
        try {
          const payload = JSON.parse(event.data) as IotStatusResponse;
          setStatus(payload);
          setIsError(false);
          setIsLoading(false);
        } catch {
          // Ignore malformed event; the next one will arrive shortly.
        }
      });

      es.addEventListener("error", () => {
        if (cancelled) return;
        setIsStreaming(false);
        es.close();
        esRef.current = null;

        // After two consecutive failures, drop to polling so the pill keeps working.
        retryRef.current += 1;
        if (retryRef.current >= 2) {
          startPolling();
          return;
        }

        // Reconnect with capped backoff.
        const delay = Math.min(5_000, 500 * Math.pow(2, retryRef.current));
        setTimeout(() => {
          if (!cancelled) startStream();
        }, delay);
      });
    };

    if (streamEnabled) {
      void fetchOnce();
      startStream();
    } else {
      startPolling();
    }

    // Reattach on tab focus / network reconnect so the pill stays fresh.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void fetchOnce();
      if (streamEnabled && !esRef.current) {
        retryRef.current = 0;
        startStream();
      }
    };
    const onOnline = () => {
      void fetchOnce();
      if (streamEnabled) {
        retryRef.current = 0;
        stopStream();
        startStream();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      stopStream();
      stopPolling();
    };
  }, [enabled]);

  return { status, isLoading, isError, isStreaming };
}

/** IoT connection pill — driven by the live `/gps/iot-stream` SSE feed. */
function IotIndicator({
  status,
  isError,
  isLoading,
  isStreaming,
}: {
  status?: IotStatusResponse;
  isError: boolean;
  isLoading: boolean;
  isStreaming: boolean;
}) {
  // Tick once per second so the "last seen" label and locally derived state
  // age out smoothly between server pushes — connectivity feels real-time even
  // if the next event hasn't arrived yet.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, []);

  // Briefly flash the pill border whenever a new heartbeat arrives.
  const [flash, setFlash] = useState(false);
  const lastHbRef = useRef<string | null>(null);
  useEffect(() => {
    const hb = status?.last_heartbeat_at ?? null;
    if (hb && hb !== lastHbRef.current) {
      lastHbRef.current = hb;
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 700);
      return () => clearTimeout(t);
    }
  }, [status?.last_heartbeat_at]);

  // Locally derive the effective state from age + server-reported state. If the
  // last heartbeat is older than the online window, downgrade immediately
  // instead of waiting for the server to confirm on the next event.
  const effective = useMemo<IotState | "loading" | "error">(() => {
    if (isError) return "error";
    if (!status) return "loading";

    const windowMs = Math.max(15, status.online_window_sec) * 1000;
    const hb = status.last_heartbeat_at ? new Date(status.last_heartbeat_at).getTime() : null;
    const ageMs = hb ? now - hb : Infinity;

    if (status.state === "unprovisioned") return "unprovisioned";

    // Server thinks something is online, but the latest heartbeat we have
    // already aged past the window — downgrade locally.
    if (Number.isFinite(ageMs) && ageMs > windowMs) return "offline";

    return status.state;
  }, [status, now, isError]);

  if (effective === "error") {
    return (
      <span
        className="hidden md:inline-flex pill pill-critical"
        title="Cannot reach IoT status feed"
      >
        <WifiOff className="h-3 w-3" /> IoT Offline
      </span>
    );
  }

  if (effective === "loading") {
    return (
      <span
        className="hidden md:inline-flex pill pill-muted"
        title="Checking IoT connectivity…"
      >
        <Radio className="h-3 w-3 animate-pulse" /> IoT …
      </span>
    );
  }

  const lastSeenLabel = formatLastSeen(status!.last_heartbeat_at, now);
  const tooltip = buildIotTooltip(status!, lastSeenLabel, effective, isStreaming);

  if (effective === "unprovisioned") {
    return (
      <span
        className="hidden md:inline-flex pill pill-muted"
        title={tooltip}
      >
        <Radio className="h-3 w-3" /> IoT Idle
      </span>
    );
  }

  if (effective === "offline") {
    return (
      <span
        className="hidden md:inline-flex pill pill-critical"
        title={tooltip}
      >
        <WifiOff className="h-3 w-3" /> IoT Offline
      </span>
    );
  }

  const totalForDisplay = Math.max(status!.expected_devices, status!.online_devices);
  const isPartial = effective === "partial";
  const pillClass = isPartial ? "pill-warn" : "pill-ok";

  return (
    <span
      className={cn(
        "hidden md:inline-flex pill transition-colors",
        pillClass,
        flash && "ring-1 ring-emerald-400/60"
      )}
      title={tooltip}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
            isPartial ? "bg-amber-400" : "bg-emerald-400"
          )}
        />
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            isPartial ? "bg-amber-400" : "bg-emerald-400"
          )}
        />
      </span>
      IoT {status!.online_devices}
      {totalForDisplay > 0 ? `/${totalForDisplay}` : ""}
    </span>
  );
}

function buildIotTooltip(
  status: IotStatusResponse,
  lastSeen: string,
  effective: IotState,
  isStreaming: boolean
): string {
  const parts: string[] = [];
  if (effective === "unprovisioned") {
    parts.push("No IoT trackers have reported yet.");
  } else if (effective === "offline") {
    parts.push("All IoT trackers are offline.");
  } else if (effective === "partial") {
    parts.push(`${status.online_devices} of ${status.expected_devices} expected trackers reporting.`);
  } else {
    parts.push(`${status.online_devices} tracker(s) online.`);
  }
  parts.push(`Last heartbeat: ${lastSeen}`);
  parts.push(isStreaming ? "Live stream · pushed in real time" : `Polling fallback · device window ${status.online_window_sec}s`);
  return parts.join("\n");
}

function formatLastSeen(iso: string | null, nowMs: number): string {
  if (!iso) return "never";
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return "never";
  const diff = Math.max(0, nowMs - ts);
  if (diff < 2_000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}
