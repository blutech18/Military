<?php

namespace App\Services;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

/**
 * Fresh fingerprint confirmation for sensitive actions (issuing and returning firearms).
 *
 * Flow: challenge() -> the bridge scans and signs against that challenge -> BiometricStepUpController
 * checks the proof and calls grant() -> the action sends the grant back and consume() accepts it once.
 *
 * A grant is bound to the user, the action and the exact target ("equipment:5", "transaction:12"),
 * lives for GRANT_TTL seconds and works once, so one scan cannot authorise anything else.
 * Only applies while the system-wide "Biometric required" setting is on.
 */
class BiometricStepUp
{
    public const ACTIONS = ['issue', 'return'];
    public const CHALLENGE_TTL = 120;
    public const GRANT_TTL = 120;
    public const MAX_ATTEMPTS = 3;

    public static function required(): bool
    {
        return SystemSetting::isBiometricRequired();
    }

    /** @return array{challenge: string, expires_in: int} */
    public static function challenge(User $user, string $action, string $target): array
    {
        $challenge = bin2hex(random_bytes(32));

        Cache::put(self::challengeKey($challenge), [
            'user_id'  => $user->user_id,
            'action'   => $action,
            'target'   => $target,
            'attempts' => 0,
        ], now()->addSeconds(self::CHALLENGE_TTL));

        return ['challenge' => $challenge, 'expires_in' => self::CHALLENGE_TTL];
    }

    public static function loadChallenge(string $challenge): ?array
    {
        $state = Cache::get(self::challengeKey($challenge));

        return is_array($state) ? $state : null;
    }

    /** Counts a failed scan; the challenge is dropped after MAX_ATTEMPTS so it cannot be guessed at. */
    public static function recordFailure(string $challenge, array $state): int
    {
        $state['attempts'] = ((int) ($state['attempts'] ?? 0)) + 1;

        if ($state['attempts'] >= self::MAX_ATTEMPTS) {
            Cache::forget(self::challengeKey($challenge));
        } else {
            Cache::put(self::challengeKey($challenge), $state, now()->addSeconds(self::CHALLENGE_TTL));
        }

        return self::MAX_ATTEMPTS - $state['attempts'];
    }

    /** @return array{grant: string, expires_in: int} */
    public static function grant(string $challenge, array $state): array
    {
        Cache::forget(self::challengeKey($challenge));

        $grant = bin2hex(random_bytes(32));
        Cache::put(self::grantKey($grant), [
            'user_id' => $state['user_id'],
            'action'  => $state['action'],
            'target'  => $state['target'],
        ], now()->addSeconds(self::GRANT_TTL));

        return ['grant' => $grant, 'expires_in' => self::GRANT_TTL];
    }

    /**
     * Called by the guarded action. Returns an error response to send back, or null to proceed.
     * Call it after request validation so a typo in the form does not burn the user's scan.
     */
    public static function consume(Request $request, string $action, string $target): ?JsonResponse
    {
        if (! self::required()) {
            return null;
        }

        $grant = (string) $request->input('biometric_grant', '');
        if ($grant === '') {
            return response()->json([
                'message'            => 'Fingerprint confirmation is required for this action.',
                'biometric_required' => true,
            ], 428);
        }

        // pull() reads and deletes in one step, which is what makes a grant single-use.
        $state = Cache::pull(self::grantKey($grant));

        if (! is_array($state)
            || (int) $state['user_id'] !== (int) $request->user()->user_id
            || $state['action'] !== $action
            || $state['target'] !== $target) {
            return response()->json([
                'message'            => 'Fingerprint confirmation is invalid or has expired. Please scan again.',
                'biometric_required' => true,
            ], 403);
        }

        return null;
    }

    // Keys hold a hash, so reading the cache table never reveals a usable grant or challenge.
    private static function challengeKey(string $challenge): string
    {
        return 'stepup-challenge:' . hash('sha256', $challenge);
    }

    private static function grantKey(string $grant): string
    {
        return 'stepup-grant:' . hash('sha256', $grant);
    }
}
