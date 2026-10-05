<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use App\Services\BiometricProof;
use App\Services\BiometricStepUp;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Fingerprint re-scan before sensitive actions. See BiometricStepUp for the overall flow.
 */
class BiometricStepUpController extends Controller
{
    /** Step 1: ask for a one-time challenge for a specific action on a specific target. */
    public function challenge(Request $request): JsonResponse
    {
        $data = $request->validate([
            'action' => ['required', 'string', 'in:' . implode(',', BiometricStepUp::ACTIONS)],
            'target' => ['required', 'string', 'max:50', 'regex:/^(equipment|transaction):\d+$/'],
        ]);

        // Biometrics switched off system-wide: nothing to confirm.
        if (! BiometricStepUp::required()) {
            return response()->json(['required' => false]);
        }

        $user = $request->user();
        if (! $user->biometric_enrolled || ! $user->biometric_data) {
            return response()->json([
                'message' => 'Your fingerprint is not enrolled yet. Sign out and sign in again to enroll it.',
            ], 409);
        }

        return response()->json([
            'required' => true,
            'username' => $user->username,
        ] + BiometricStepUp::challenge($user, $data['action'], $data['target']));
    }

    /** Step 2: submit the bridge's signed scan for that challenge; a match returns a one-time grant. */
    public function verify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge'         => ['required', 'string', 'max:128'],
            'fingerprint'       => ['required', 'string', 'min:32'],
            'source'            => ['required', 'string', 'in:digitalpersona_bridge,futronic_bridge,demo_placeholder'],
            'capture_signature' => ['nullable', 'string', 'size:64'],
            'captured_at'       => ['nullable', 'date'],
        ]);

        $user = $request->user();
        $state = BiometricStepUp::loadChallenge($data['challenge']);

        if (! $state || (int) $state['user_id'] !== (int) $user->user_id) {
            return response()->json(['message' => 'This confirmation expired. Close it and try again.'], 419);
        }

        $label = "{$state['action']} ({$state['target']})";

        $error = BiometricProof::check($data, $user, $data['challenge'], $request, 'biometric_stepup_failed');
        if ($error) {
            BiometricStepUp::recordFailure($data['challenge'], $state);
            return $error;
        }

        $matches = $user->biometric_data
            && hash_equals($user->biometric_data, BiometricProof::hash($data['fingerprint']));

        if (! $matches) {
            $left = BiometricStepUp::recordFailure($data['challenge'], $state);
            AuditLogger::log('biometric_stepup_failed', "Fingerprint did not match before {$label}", $user, request: $request);

            return response()->json([
                'message' => $left > 0
                    ? "Fingerprint does not match. {$left} attempt(s) left."
                    : 'Fingerprint does not match. Close this and start again.',
            ], 401);
        }

        AuditLogger::log(
            'biometric_stepup',
            "Fingerprint re-verified before {$label}",
            $user,
            request: $request,
            metadata: ['action' => $state['action'], 'target' => $state['target'], 'source' => $data['source']],
        );

        return response()->json(BiometricStepUp::grant($data['challenge'], $state));
    }
}
