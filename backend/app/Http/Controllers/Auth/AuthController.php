<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Models\SystemSetting;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use PragmaRX\Google2FA\Google2FA;

class AuthController extends Controller
{
    public function __construct(private Google2FA $google2fa) {}

    /**
     * Public login-flow metadata used by the sign-in page.
     */
    public function requirements(): JsonResponse
    {
        $totpRequired = SystemSetting::isTotpRequired();
        $biometricRequired = SystemSetting::isBiometricRequired();

        return response()->json([
            'totp_required'      => $totpRequired,
            'biometric_required' => $biometricRequired,
            'mfa_required'       => $totpRequired || $biometricRequired,
        ]);
    }

    /**
     * STEP 1 — Username + password.
     * Returns a short-lived "challenge" token that must accompany TOTP & fingerprint steps.
     */
    public function login(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username'         => ['required', 'string', 'max:50'],
            'password'         => ['required', 'string', 'max:200'],
            'recaptcha_token'  => ['nullable', 'string'],
        ]);

        $ip = $request->ip();
        $failKey = "login-fail:{$data['username']}:{$ip}";
        $fails   = (int) Cache::get($failKey, 0);
        $threshold = (int) config('armory.failed_login_threshold', 3);

        // Once threshold exceeded → require reCAPTCHA
        if ($fails >= $threshold && empty($data['recaptcha_token'])) {
            return response()->json([
                'message'           => "Too many failed attempts. reCAPTCHA required.",
                'recaptcha_required'=> true,
                'attempts'          => $fails,
            ], 429);
        }

        $user = User::with('role')->where('username', $data['username'])->first();

        if (! $user || ! Hash::check($data['password'], $user->password)) {
            Cache::put($failKey, $fails + 1, now()->addMinutes(15));

            if ($user) {
                $user->increment('failed_login_attempts');

                // Lock account after N consecutive failures
                $lockoutAttempts = (int) config('armory.lockout_attempts', 5);
                if ($user->failed_login_attempts >= $lockoutAttempts) {
                    $lockoutMinutes = (int) config('armory.lockout_minutes', 30);
                    $user->update(['locked_until' => now()->addMinutes($lockoutMinutes)]);

                    Notification::create([
                        'user_id'      => $user->user_id,
                        'type'         => 'account_locked',
                        'severity'     => Notification::SEVERITY_CRITICAL,
                        'title'        => 'Account Locked',
                        'message'      => "Account {$user->username} locked after {$lockoutAttempts} failed attempts. Unlocks in {$lockoutMinutes} min.",
                        'payload'      => ['ip' => $ip, 'attempts' => $user->failed_login_attempts],
                    ]);

                    AuditLogger::log('account_locked', "Account {$user->username} locked after {$lockoutAttempts} failures", $user, request: $request);
                }

                AuditLogger::log('failed_login', "Failed password for {$data['username']}", $user, request: $request);
            } else {
                AuditLogger::log('failed_login', "Unknown username {$data['username']}", request: $request);
            }

            return response()->json(['message' => 'Invalid credentials.'], 401);
        }

        if ((int) $user->status !== User::STATUS_ACTIVE) {
            return response()->json(['message' => 'Account is inactive.'], 403);
        }

        if ($user->isLocked()) {
            return response()->json(['message' => 'Account is locked.'], 423);
        }

        // Issue a short-lived challenge token (valid 5 min) for MFA + biometric
        $challenge = bin2hex(random_bytes(32));

        // Both TOTP and biometric are system-wide requirements controlled by
        // admin toggles. When enabled, every user (regardless of role) must
        // go through that step.
        $needsTotp      = SystemSetting::isTotpRequired();
        $needsBiometric = SystemSetting::isBiometricRequired();

        // If both MFA methods are effectively disabled → skip to token issuance
        if (! $needsTotp && ! $needsBiometric) {
            AuditLogger::log('login_step1', "Password verified for {$user->username} (MFA skipped — system-wide MFA off)", $user, request: $request);
            return $this->finalizeLogin($user, $request, $challenge);
        }

        Cache::put("login-challenge:{$challenge}", [
            'user_id'      => $user->user_id,
            'password_ok'  => true,
            'totp_ok'      => ! $needsTotp,             // auto-pass if system-wide TOTP is off
            'biometric_ok' => ! $needsBiometric,        // auto-pass if system-wide biometric is off
            'started_at'   => now()->timestamp,
        ], now()->addMinutes(5));

        AuditLogger::log('login_step1', "Password verified for {$user->username}", $user, request: $request);

        // Determine the next step for the frontend
        if ($needsTotp) {
            $next = $user->totp_secret ? 'totp' : 'totp_setup';
        } elseif ($needsBiometric) {
            $next = $user->biometric_data ? 'biometric' : 'biometric_enroll';
        } else {
            $next = 'totp_setup';
        }

        return response()->json([
            'message'           => 'Password verified — proceed to MFA.',
            'challenge_token'   => $challenge,
            'next'              => $next,
            'totp_enabled'      => $needsTotp,
            'biometric_enrolled'=> $needsBiometric,
        ]);
    }

    /**
     * STEP 2a — TOTP setup (first-time enrollment).
     */
    public function totpSetup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge_token' => ['required', 'string'],
        ]);

        $state = $this->loadChallenge($data['challenge_token']);
        if (! $state) {
            return response()->json(['message' => 'Invalid or expired challenge.'], 419);
        }

        $user   = User::find($state['user_id']);
        $secret = $this->google2fa->generateSecretKey();

        $user->update(['totp_secret' => $secret]);

        $issuer = config('armory.totp.issuer');
        $otpauth = $this->google2fa->getQRCodeUrl($issuer, $user->email, $secret);

        return response()->json([
            'secret'  => $secret,
            'otpauth' => $otpauth,
            'issuer'  => $issuer,
            'message' => 'Scan QR in Google Authenticator, then verify code.',
        ]);
    }

    /**
     * STEP 2b — TOTP verify (also enables totp_enabled on first success).
     */
    public function totpVerify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge_token' => ['required', 'string'],
            'code'            => ['required', 'string', 'size:6'],
        ]);

        $state = $this->loadChallenge($data['challenge_token']);
        if (! $state) {
            return response()->json(['message' => 'Invalid or expired challenge.'], 419);
        }

        $user = User::find($state['user_id']);

        if (! $user->totp_secret) {
            return response()->json(['message' => 'TOTP not initialised.'], 400);
        }

        $valid = $this->google2fa->verifyKey($user->totp_secret, $data['code'], 1);
        if (! $valid) {
            AuditLogger::log('failed_login', 'Invalid TOTP', $user, request: $request);
            return response()->json(['message' => 'Invalid TOTP code.'], 401);
        }

        if (! $user->totp_enabled) {
            $user->update(['totp_enabled' => true]);
        }

        $state['totp_ok'] = true;
        Cache::put("login-challenge:{$data['challenge_token']}", $state, now()->addMinutes(5));

        AuditLogger::log('login_step2', "TOTP verified for {$user->username}", $user, request: $request);

        // If biometric is not wanted → finalize login directly
        if (! $user->biometric_enrolled) {
            return $this->finalizeLogin($user, $request, $data['challenge_token']);
        }

        return response()->json([
            'message' => 'TOTP verified.',
            'next'    => $user->biometric_data ? 'biometric' : 'biometric_enroll',
        ]);
    }

    /**
     * STEP 3 — Biometric (fingerprint) verify.
     * Frontend sends a base64 fingerprint template captured by the Futronic SDK.
     * For demo purposes a SHA-256 of the template must match the stored encrypted hash.
     */
    public function biometricVerify(Request $request): JsonResponse
    {
        $data = $request->validate([
            'challenge_token' => ['required', 'string'],
            'fingerprint'     => ['required', 'string', 'min:32'],
            'source'          => ['nullable', 'string', 'in:futronic_bridge,demo_placeholder'],
        ]);

        $state = $this->loadChallenge($data['challenge_token']);
        if (! $state) {
            return response()->json(['message' => 'Invalid or expired challenge.'], 419);
        }

        $user = User::find($state['user_id']);
        $hash = hash('sha256', $data['fingerprint']);

        if ($user->biometric_enrolled && $user->biometric_data) {
            // Verify mode — compare against stored hash
            if ($user->biometric_data !== $hash) {
                AuditLogger::log('failed_login', 'Biometric mismatch', $user, request: $request);
                return response()->json(['message' => 'Fingerprint does not match.'], 401);
            }
        } else {
            // Enrollment mode — store the new fingerprint hash
            $user->update([
                'biometric_data'    => $hash,
                'biometric_enrolled'=> true,
            ]);
        }

        $state['biometric_ok'] = true;
        Cache::put("login-challenge:{$data['challenge_token']}", $state, now()->addMinutes(5));

        AuditLogger::log(
            'login_step3',
            "Biometric verified for {$user->username}",
            $user,
            request: $request,
            metadata: ['source' => $data['source'] ?? 'unknown'],
        );

        return $this->finalizeLogin($user, $request, $data['challenge_token']);
    }

    /**
     * Finalize: clear failures, reset attempts, issue Sanctum token.
     */
    protected function finalizeLogin(User $user, Request $request, string $token): JsonResponse
    {
        $user->update([
            'failed_login_attempts' => 0,
            'last_login_at'         => now(),
            'last_login_ip'         => $request->ip(),
            'locked_until'          => null,
        ]);

        Cache::forget("login-challenge:{$token}");
        Cache::forget("login-fail:{$user->username}:{$request->ip()}");

        $tokenString = $user->createToken(
            name: 'armorydb-' . substr(md5($request->userAgent() ?? ''), 0, 8),
            abilities: [optional($user->role)->role_name ?? 'personnel'],
            expiresAt: SystemSetting::isSessionExpiryEnabled()
                ? now()->addMinutes((int) config('armory.session.timeout_minutes'))
                : null
        )->plainTextToken;

        AuditLogger::log('login', "Successful login by {$user->username}", $user, request: $request);

        $user->load('role');

        $expiresIn = SystemSetting::isSessionExpiryEnabled()
            ? (int) config('armory.session.timeout_minutes') * 60
            : null;

        return response()->json([
            'message'       => 'Login successful.',
            'token'         => $tokenString,
            'token_type'    => 'Bearer',
            'expires_in'    => $expiresIn,
            'user'          => [
                'user_id'            => $user->user_id,
                'username'           => $user->username,
                'full_name'          => $user->fullName(),
                'email'              => $user->email,
                'rank'               => $user->rank,
                'role'               => optional($user->role)->role_name,
                'security_clearance' => $user->security_clearance,
                'totp_enabled'       => (bool) $user->totp_enabled,
                'biometric_enrolled' => (bool) $user->biometric_enrolled,
            ],
        ]);
    }

    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('role');
        return response()->json([
            'user_id'            => $user->user_id,
            'username'           => $user->username,
            'full_name'          => $user->fullName(),
            'email'              => $user->email,
            'rank'               => $user->rank,
            'role'               => optional($user->role)->role_name,
            'security_clearance' => $user->security_clearance,
            'totp_enabled'       => (bool) $user->totp_enabled,
            'biometric_enrolled' => (bool) $user->biometric_enrolled,
            'last_login_at'      => $user->last_login_at,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $user = $request->user();
        $request->user()->currentAccessToken()->delete();
        AuditLogger::log('logout', "User {$user->username} logged out", $user, request: $request);
        return response()->json(['message' => 'Logged out.']);
    }

    /**
     * Self-service password change for authenticated users.
     */
    public function changePassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
            'new_password'     => ['required', 'string', 'min:10', 'max:200', 'confirmed'],
        ]);

        $user = $request->user();

        if (!Hash::check($data['current_password'], $user->password)) {
            return response()->json(['message' => 'Current password is incorrect.'], 422);
        }

        $user->update(['password' => Hash::make($data['new_password'])]);

        AuditLogger::log('password_change', "Password changed for {$user->username}", $user, request: $request);

        return response()->json(['message' => 'Password updated successfully.']);
    }

    /**
     * Verify current password (used before showing new-password fields).
     */
    public function verifyPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'current_password' => ['required', 'string'],
        ]);

        $user = $request->user();

        if (!Hash::check($data['current_password'], $user->password)) {
            return response()->json(['message' => 'Incorrect password.'], 422);
        }

        return response()->json(['message' => 'Password verified.']);
    }

    /**
     * Self-service: reset own TOTP so it re-enrolls on next login.
     */
    public function resetTotp(Request $request): JsonResponse
    {
        $user = $request->user();

        $user->update([
            'totp_secret'  => null,
            'totp_enabled' => false,
        ]);

        AuditLogger::log('totp_reset', "TOTP self-reset by {$user->username}", $user, request: $request);

        return response()->json([
            'message'      => 'TOTP has been reset. You will re-enroll on next login.',
            'totp_enabled' => false,
        ]);
    }

    /**
     * Self-service: reset own biometric so it re-enrolls on next login.
     */
    public function resetBiometric(Request $request): JsonResponse
    {
        $user = $request->user();

        $user->update([
            'biometric_data'     => null,
            'biometric_enrolled' => false,
        ]);

        AuditLogger::log('biometric_reset', "Biometric self-reset by {$user->username}", $user, request: $request);

        return response()->json([
            'message'            => 'Biometric data has been reset. You will re-enroll on next login.',
            'biometric_enrolled' => false,
        ]);
    }

    /**
     * Self-service: re-enable TOTP (admin-only).
     */
    public function enableTotp(Request $request): JsonResponse
    {
        $user = $request->user();

        if (optional($user->role)->role_name !== 'Administrator') {
            return response()->json([
                'message' => 'TOTP is available for Administrators only.',
            ], 403);
        }

        $user->update(['totp_enabled' => true]);

        AuditLogger::log('totp_enable', "TOTP re-enabled by {$user->username}", $user, request: $request);

        return response()->json([
            'message'      => 'TOTP enabled. You will set up Google Authenticator on your next login.',
            'totp_enabled' => true,
        ]);
    }

    /**
     * Self-service: re-enable biometric (will require enrollment on next login).
     */
    public function enableBiometric(Request $request): JsonResponse
    {
        $user = $request->user();

        $user->update(['biometric_enrolled' => true]);

        AuditLogger::log('biometric_enable', "Biometric re-enabled by {$user->username}", $user, request: $request);

        return response()->json([
            'message'            => 'Biometric enabled. You will enroll your fingerprint on your next login.',
            'biometric_enrolled' => true,
        ]);
    }

    protected function loadChallenge(string $token): ?array
    {
        return Cache::get("login-challenge:{$token}");
    }
}
