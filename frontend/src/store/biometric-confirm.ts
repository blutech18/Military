import { create } from "zustand";
import { api } from "@/lib/api";

/**
 * Fingerprint re-scan before sensitive actions. `confirmBiometric()` is awaited by the code that
 * issues or returns a firearm; the popup (BiometricConfirmHost) does the scanning.
 */

export type StepUpAction = "issue" | "return";

export class BiometricCancelled extends Error {
  constructor() {
    super("Fingerprint confirmation cancelled.");
    this.name = "BiometricCancelled";
  }
}

export function isBiometricCancelled(error: unknown): boolean {
  return error instanceof BiometricCancelled;
}

export type PendingConfirmation = {
  action: StepUpAction;
  target: string;
  challenge: string;
  username: string;
  resolve: (grant: string) => void;
  reject: (error: Error) => void;
};

interface ConfirmState {
  pending: PendingConfirmation | null;
  open(pending: PendingConfirmation): void;
  close(): void;
}

export const useBiometricConfirm = create<ConfirmState>((set) => ({
  pending: null,
  open: (pending) => set({ pending }),
  close: () => set({ pending: null }),
}));

type ChallengeResponse =
  | { required: false }
  | { required: true; challenge: string; username: string; expires_in: number };

/**
 * Resolves with a one-time grant to send as `biometric_grant`, or "" when the system does not
 * require fingerprints. Rejects with BiometricCancelled if the user closes the popup; any other
 * rejection is a real error (for example "fingerprint not enrolled") to show to the user.
 *
 * `target` ties the scan to one firearm or transaction: "equipment:5" or "transaction:12".
 */
export async function confirmBiometric(action: StepUpAction, target: string): Promise<string> {
  const { data } = await api.post<ChallengeResponse>("/auth/biometric/step-up/challenge", { action, target });
  if (!data.required) return "";

  return new Promise<string>((resolve, reject) => {
    const store = useBiometricConfirm.getState();
    // Only one confirmation at a time; a newer request replaces an abandoned one.
    store.pending?.reject(new BiometricCancelled());
    store.open({ action, target, challenge: data.challenge, username: data.username, resolve, reject });
  });
}
