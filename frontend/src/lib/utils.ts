import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format, formatDistanceToNow } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(d?: string | Date | null, pattern = "yyyy-MM-dd HH:mm") {
  if (!d) return "—";
  try {
    return format(new Date(d), pattern);
  } catch {
    return "—";
  }
}

export function fmtRelative(d?: string | Date | null) {
  if (!d) return "—";
  try {
    return formatDistanceToNow(new Date(d), { addSuffix: true });
  } catch {
    return "—";
  }
}

export const PURPOSES: Record<number, string> = {
  1: "Training",
  2: "Operation",
  3: "Maintenance",
  4: "Inspection",
};

export const CONDITIONS: Record<number, { label: string; tone: string }> = {
  1: { label: "Excellent", tone: "pill-ok" },
  2: { label: "Good",      tone: "pill-tactical" },
  3: { label: "Fair",      tone: "pill-warn" },
  4: { label: "Poor",      tone: "pill-critical" },
};

export const STATUSES: Record<number, { label: string; tone: string }> = {
  1: { label: "Available",   tone: "pill-ok" },
  2: { label: "Checked Out", tone: "pill-info" },
  3: { label: "Maintenance", tone: "pill-warn" },
  4: { label: "Overdue",     tone: "pill-critical" },
};

export const CLEARANCES: Record<number, string> = {
  1: "Confidential",
  2: "Secret",
  3: "Top Secret",
};
