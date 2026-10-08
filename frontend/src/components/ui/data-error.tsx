"use client";

import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { CLEARANCES } from "@/lib/utils";

interface DataErrorProps {
  /** Overrides the description for connection errors. */
  message?: string;
  onRetry?: () => void;
  /** The failed request's error (e.g. React Query's `error`), used to explain what went wrong. */
  error?: unknown;
}

type ErrorResponse = {
  response?: {
    status?: number;
    data?: { message?: string; required_level?: number; your_clearance?: number };
  };
};

/** Explains a failed data load: no permission, expired session, server fault, or no connection. */
export function DataError({
  message = "Unable to connect to the server. Please check that the backend service is running and try again.",
  onRetry,
  error,
}: DataErrorProps) {
  const response = (error as ErrorResponse | undefined)?.response;
  const status = response?.status;
  const data = response?.data;

  let title = "Connection Error";
  let description = message;
  let retryable = true;
  let restricted = false;

  if (status === 403) {
    restricted = true;
    retryable = false; // retrying cannot grant access
    title = "Access restricted";
    description =
      data?.required_level
        ? `This needs ${CLEARANCES[data.required_level]} clearance or higher` +
          (data.your_clearance ? `; your account has ${CLEARANCES[data.your_clearance]}.` : ".") +
          " Ask an administrator to update your clearance in User Management."
        : data?.message ?? "Your account is not allowed to view this data.";
  } else if (status === 401) {
    retryable = false;
    title = "Session expired";
    description = "Please sign in again.";
  } else if (status && status >= 500) {
    title = "Server error";
    description = data?.message ?? "The server could not complete the request. Try again in a moment.";
  } else if (status && status >= 400) {
    title = "Request failed";
    description = data?.message ?? "The server rejected the request.";
    retryable = false;
  }

  return (
    <div className="glass rounded-xl p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-3">
      <div
        className={
          restricted
            ? "h-12 w-12 rounded-full bg-amber-900/30 flex items-center justify-center"
            : "h-12 w-12 rounded-full bg-red-900/30 flex items-center justify-center"
        }
      >
        {restricted ? <Lock className="h-6 w-6 text-amber-300" /> : <AlertTriangle className="h-6 w-6 text-red-400" />}
      </div>
      <p className="text-sm text-steel-200 font-semibold">{title}</p>
      <p className="text-xs text-steel-400 max-w-md">{description}</p>
      {onRetry && retryable && (
        <button onClick={onRetry} className="btn-secondary text-xs flex items-center gap-1.5 mt-2">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}
