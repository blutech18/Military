<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class EmailDeliveryService
{
    /**
     * Get Mailjet credentials [apiKey, secretKey] from environment.
     * Free tier: 200 emails/day, sends to ANY recipient, no domain verification needed.
     */
    public static function getMailjetCredentials(): array
    {
        $apiKey    = $_SERVER['MAILJET_API_KEY']    ?? $_ENV['MAILJET_API_KEY']    ?? getenv('MAILJET_API_KEY')    ?: config('services.mailjet.key')    ?: null;
        $secretKey = $_SERVER['MAILJET_SECRET_KEY'] ?? $_ENV['MAILJET_SECRET_KEY'] ?? getenv('MAILJET_SECRET_KEY') ?: config('services.mailjet.secret') ?: null;
        return [$apiKey, $secretKey];
    }

    /**
     * Get Brevo API key from environment.
     * Free tier: 300 emails/day, sends to ANY recipient, no domain verification needed.
     */
    public static function getBrevoKey(): ?string
    {
        $key = $_SERVER['BREVO_API_KEY'] ?? $_ENV['BREVO_API_KEY'] ?? getenv('BREVO_API_KEY') ?: null;
        return !empty($key) ? $key : (config('services.brevo.key') ?: null);
    }

    /**
     * Get Resend API key from environment.
     * Free tier: sends ONLY to the Resend account owner's email (limited).
     */
    public static function getResendKey(): ?string
    {
        $key = $_SERVER['RESEND_API_KEY'] ?? $_ENV['RESEND_API_KEY'] ?? getenv('RESEND_API_KEY') ?: null;
        return !empty($key) ? $key : (config('services.resend.key') ?: null);
    }

    /**
     * Dispatch a 6-digit password reset verification email.
     *
     * Provider priority: Mailjet → Brevo → Resend → sandbox (local only)
     *
     * @return array{sent: bool, provider: string, sandbox_mode: bool, error: ?string, code: ?string}
     */
    public static function sendPasswordReset(User $user, string $code, string $ipAddress, int $expiresMinutes = 15): array
    {
        $subject  = '[ArmoryDB] Password Reset Verification Code';
        $html     = view('emails.password-reset-code', [
            'user'           => $user,
            'code'           => $code,
            'ipAddress'      => $ipAddress,
            'expiresMinutes' => $expiresMinutes,
        ])->render();

        $isProduction = app()->environment('production');
        $fromName     = config('mail.from.name') ?: 'ArmoryDB - 10RCDG';

        // ── 1. Mailjet (best free tier, any recipient, no domain required) ──
        [$mjKey, $mjSecret] = self::getMailjetCredentials();
        if (!empty($mjKey) && !empty($mjSecret)) {
            $res = self::sendViaMailjet($mjKey, $mjSecret, $fromName, $user->email, $subject, $html);
            if ($res['success']) {
                Log::info("Password reset dispatched via Mailjet to {$user->email}");
                return ['sent' => true, 'provider' => 'mailjet', 'sandbox_mode' => false, 'error' => null, 'code' => null];
            }
            Log::warning("Mailjet failed for {$user->email}: " . ($res['error'] ?? 'unknown'));
        }

        // ── 2. Brevo (fallback, any recipient, no domain required) ──────────
        $brevoKey = self::getBrevoKey();
        if (!empty($brevoKey)) {
            $res = self::sendViaBrevo($brevoKey, $fromName, $user->email, $subject, $html);
            if ($res['success']) {
                Log::info("Password reset dispatched via Brevo to {$user->email}");
                return ['sent' => true, 'provider' => 'brevo', 'sandbox_mode' => false, 'error' => null, 'code' => null];
            }
            Log::warning("Brevo failed for {$user->email}: " . ($res['error'] ?? 'unknown'));
        }

        // ── 3. Resend (fallback, restricted to account owner email) ─────────
        $resendKey = self::getResendKey();
        if (!empty($resendKey)) {
            $from = "{$fromName} <onboarding@resend.dev>";
            $res  = self::sendViaResend($resendKey, $from, $user->email, $subject, $html);
            if ($res['success']) {
                Log::info("Password reset dispatched via Resend to {$user->email}");
                return ['sent' => true, 'provider' => 'resend', 'sandbox_mode' => false, 'error' => null, 'code' => null];
            }
            Log::error("Resend failed for {$user->email}: " . ($res['error'] ?? 'unknown'));

            if ($isProduction) {
                return ['sent' => false, 'provider' => 'resend_failed', 'sandbox_mode' => false, 'error' => $res['error'], 'code' => null];
            }
            return ['sent' => false, 'provider' => 'resend_failed', 'sandbox_mode' => true, 'error' => $res['error'], 'code' => $code];
        }

        // ── 4. No provider configured ────────────────────────────────────────
        if ($isProduction) {
            Log::error('Email delivery failed: no email provider configured.', [
                'mailjet_set' => !empty($mjKey),
                'brevo_set'   => !empty($brevoKey),
                'resend_set'  => !empty($resendKey),
                'APP_ENV'     => app()->environment(),
            ]);
            return [
                'sent'         => false,
                'provider'     => 'unconfigured',
                'sandbox_mode' => false,
                'error'        => 'Email service is not configured. Please contact the administrator.',
                'code'         => null,
            ];
        }

        Log::info("Password reset sandbox mode for {$user->username}: {$code}");
        return ['sent' => false, 'provider' => 'local_sandbox', 'sandbox_mode' => true, 'error' => 'No email provider configured.', 'code' => $code];
    }

    /**
     * Dispatch an alert notification email.
     */
    public static function sendAlert(Notification $notification, User $recipient): bool
    {
        $subject  = match ($notification->severity) {
            'critical' => '🚨 CRITICAL: ' . $notification->title,
            'warning'  => '⚠️ WARNING: '  . $notification->title,
            default    => 'ℹ️ INFO: '     . $notification->title,
        };
        $html     = view('emails.alert-notification', [
            'notification'  => $notification,
            'recipientName' => $recipient->fullName(),
        ])->render();
        $fromName = config('mail.from.name') ?: 'ArmoryDB - 10RCDG';

        // Try Mailjet first
        [$mjKey, $mjSecret] = self::getMailjetCredentials();
        if (!empty($mjKey) && !empty($mjSecret)) {
            $res = self::sendViaMailjet($mjKey, $mjSecret, $fromName, $recipient->email, $subject, $html);
            if ($res['success']) return true;
            Log::warning("Mailjet alert failed to {$recipient->email}: " . ($res['error'] ?? 'unknown'));
        }

        // Fallback to Brevo
        $brevoKey = self::getBrevoKey();
        if (!empty($brevoKey)) {
            $res = self::sendViaBrevo($brevoKey, $fromName, $recipient->email, $subject, $html);
            if ($res['success']) return true;
            Log::warning("Brevo alert failed to {$recipient->email}: " . ($res['error'] ?? 'unknown'));
        }

        // Fallback to Resend
        $resendKey = self::getResendKey();
        if (!empty($resendKey)) {
            $from = "{$fromName} <onboarding@resend.dev>";
            $res  = self::sendViaResend($resendKey, $from, $recipient->email, $subject, $html);
            if ($res['success']) return true;
            Log::warning("Resend alert failed to {$recipient->email}: " . ($res['error'] ?? 'unknown'));
        }

        Log::info("Alert #{$notification->notification_id} skipped — no email provider available.");
        return false;
    }

    /**
     * Send via Mailjet REST API v3.1
     * Free: 200 emails/day — no domain verification — any recipient.
     *
     * @return array{success: bool, error: ?string}
     */
    protected static function sendViaMailjet(string $apiKey, string $secretKey, string $fromName, string $to, string $subject, string $html): array
    {
        try {
            $response = Http::withBasicAuth($apiKey, $secretKey)
                ->timeout(10)
                ->post('https://api.mailjet.com/v3.1/send', [
                    'Messages' => [[
                        'From'     => ['Email' => 'noreply@armorydb.app', 'Name' => $fromName],
                        'To'       => [['Email' => $to]],
                        'Subject'  => $subject,
                        'HTMLPart' => $html,
                    ]],
                ]);

            if ($response->successful()) {
                return ['success' => true, 'error' => null];
            }

            $errorMsg = $response->json('ErrorMessage') ?? $response->json('Messages.0.Errors.0.ErrorMessage') ?? $response->body();
            return ['success' => false, 'error' => $errorMsg];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Send via Brevo Transactional Email API v3.
     * Free: 300 emails/day — no domain verification — any recipient.
     *
     * @return array{success: bool, error: ?string}
     */
    protected static function sendViaBrevo(string $apiKey, string $fromName, string $to, string $subject, string $html): array
    {
        try {
            $response = Http::withHeaders(['api-key' => $apiKey])
                ->timeout(10)
                ->post('https://api.brevo.com/v3/smtp/email', [
                    'sender'      => ['name' => $fromName, 'email' => 'noreply@armorydb.app'],
                    'to'          => [['email' => $to]],
                    'subject'     => $subject,
                    'htmlContent' => $html,
                ]);

            if ($response->successful()) {
                return ['success' => true, 'error' => null];
            }

            return ['success' => false, 'error' => $response->json('message') ?? $response->body()];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Send via Resend REST API.
     * Free: restricted to Resend account owner's email only.
     *
     * @return array{success: bool, error: ?string}
     */
    protected static function sendViaResend(string $apiKey, string $from, string $to, string $subject, string $html): array
    {
        try {
            $response = Http::withToken($apiKey)
                ->timeout(8)
                ->post('https://api.resend.com/emails', [
                    'from'    => $from,
                    'to'      => [$to],
                    'subject' => $subject,
                    'html'    => $html,
                ]);

            if ($response->successful()) {
                return ['success' => true, 'error' => null];
            }

            return ['success' => false, 'error' => $response->json('message') ?? $response->body()];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
