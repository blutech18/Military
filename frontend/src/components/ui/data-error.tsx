"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";

interface DataErrorProps {
  message?: string;
  onRetry?: () => void;
}

export function DataError({
  message = "Unable to connect to the server. Please check that the backend service is running and try again.",
  onRetry,
}: DataErrorProps) {
  return (
    <div className="glass rounded-xl p-8 flex flex-col items-center justify-center text-center space-y-3">
      <div className="h-12 w-12 rounded-full bg-red-900/30 flex items-center justify-center">
        <AlertTriangle className="h-6 w-6 text-red-400" />
      </div>
      <p className="text-sm text-steel-200 font-semibold">Connection Error</p>
      <p className="text-xs text-steel-400 max-w-md">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary text-xs flex items-center gap-1.5 mt-2">
          <RefreshCw className="h-3.5 w-3.5" /> Retry
        </button>
      )}
    </div>
  );
}
