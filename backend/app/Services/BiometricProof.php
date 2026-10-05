<?php

namespace App\Services;

use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Verifies that a fingerprint capture really came from the local biometric bridge.
 *
 * The bridge does the 1:1 biometric match with the reader SDK and, on a match, releases the
 * user's enrollment token as "fingerprint" together with
 *   HMAC-SHA256(bridge secret, challenge | username | captured_at | sha256(token)).
 * Binding the signature to a one-time challenge stops a captured response being replayed.
 * Shared by the login step and the issue/return step-up so both enforce identical rules.
 */
class BiometricProof
{
    public static function hash(string $fingerprint): string
    {
        return hash('sha256', $fingerprint);
    }

    public static function demoModeAllowed(): bool
    {
        return app()->environment(['local', 'testing']) && (bool) config('armory.demo_mode');
    }

    /**
     * @param array  $data           validated request data: fingerprint, source, capture_signature, captured_at
     * @param string $challengeToken the one-time challenge the capture was bound to
     * @param string $failureAction  audit action recorded when the signature is wrong
     * @return JsonResponse|null     an error response, or null when the capture is authentic
     */
    public static function check(
        array $data,
        User $user,
        string $challengeToken,
        Request $request,
        string $failureAction = 'failed_login',
    ): ?JsonResponse {
        if ($data['source'] === 'demo_placeholder') {
            return self::demoModeAllowed()
                ? null
                : response()->json(['message' => 'Biometric demo mode is disabled.'], 403);
        }

        $bridgeSecret = (string) config('armory.biometric.bridge_hmac_secret');
        if ($bridgeSecret === '') {
            return response()->json(['message' => 'Biometric bridge attestation is not configured.'], 503);
        }
        if (empty($data['capture_signature']) || empty($data['captured_at'])) {
            return response()->json(['message' => 'Biometric bridge attestation is required.'], 422);
        }

        $capturedAt = CarbonImmutable::parse($data['captured_at']);
        $maxAgeSeconds = max(1, (int) config('armory.biometric.attestation_max_age_seconds', 60));
        if ($capturedAt->lt(CarbonImmutable::now()->subSeconds($maxAgeSeconds))
            || $capturedAt->gt(CarbonImmutable::now()->addSeconds(5))) {
            return response()->json(['message' => 'Biometric bridge attestation is expired or invalid.'], 422);
        }

        $payload = implode('|', [
            $challengeToken,
            $user->username,
            $data['captured_at'],
            self::hash($data['fingerprint']),
        ]);
        $expected = hash_hmac('sha256', $payload, $bridgeSecret);
        if (! hash_equals($expected, strtolower($data['capture_signature']))) {
            AuditLogger::log($failureAction, 'Invalid biometric bridge attestation', $user, request: $request);
            return response()->json(['message' => 'Biometric bridge attestation is invalid.'], 401);
        }

        return null;
    }
}
