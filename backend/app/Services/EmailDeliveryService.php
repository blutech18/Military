<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class EmailDeliveryService
{
    /**
     * Get the active Resend API key from config or environment.
     */
    public static function getApiKey(): ?string
    {
        return config('services.resend.key')
            ?: env('RESEND_API_KEY')
            ?: getenv('RESEND_API_KEY')
            ?: ($_ENV['RESEND_API_KEY'] ?? ($_SERVER['RESEND_API_KEY'] ?? null));
    }

    /**
     * Dispatch a 6-digit password reset verification email using Resend API (HTTPS port 443).
     *
     * In production (APP_ENV=production):
     * - Dispatches exclusively via Resend API.
     * - Never exposes the verification code in the response payload.
     *
     * In local development (APP_ENV!=production):
     * - If RESEND_API_KEY is omitted, enables sandbox mode for offline testing.
     *
     * @return array{sent: bool, provider: string, sandbox_mode: bool, error: ?string, code: ?string}
     */
    public static function sendPasswordReset(User $user, string $code, string $ipAddress, int $expiresMinutes = 15): array
    {
        $subject = '[ArmoryDB] Password Reset Verification Code';
        $html = view('emails.password-reset-code', [
            'user'           => $user,
            'code'           => $code,
            'ipAddress'      => $ipAddress,
            'expiresMinutes' => $expiresMinutes,
        ])->render();

        $resendKey = self::getApiKey();
        $isProduction = app()->environment('production');

        // 1. Dispatch via Resend API if API key is provided
        if (!empty($resendKey)) {
            $from = self::resolveFromAddress();
            $response = self::sendViaResend($resendKey, $from, $user->email, $subject, $html);

            if ($response['success']) {
                Log::info("Password reset code dispatched via Resend API to {$user->email}");
                return [
                    'sent'         => true,
                    'provider'     => 'resend',
                    'sandbox_mode' => false,
                    'error'        => null,
                    'code'         => null,
                ];
            }

            Log::error("Resend API dispatch failed for {$user->email}: " . ($response['error'] ?? 'unknown error'));

            // In production, never expose verification code on failure
            if ($isProduction) {
                return [
                    'sent'         => false,
                    'provider'     => 'resend_failed',
                    'sandbox_mode' => false,
                    'error'        => $response['error'],
                    'code'         => null,
                ];
            }

            // Local development only fallback
            return [
                'sent'         => false,
                'provider'     => 'resend_failed',
                'sandbox_mode' => true,
                'error'        => $response['error'],
                'code'         => $code,
            ];
        }

        // In production, missing RESEND_API_KEY is an unrecoverable configuration error
        if ($isProduction) {
            Log::error("Email delivery failed: RESEND_API_KEY is not configured in production environment.");
            return [
                'sent'         => false,
                'provider'     => 'unconfigured',
                'sandbox_mode' => false,
                'error'        => 'Email service is not configured. Please contact the administrator.',
                'code'         => null,
            ];
        }

        // Local development sandbox mode
        Log::info("Password reset code generated in local sandbox mode for {$user->username}: {$code}");
        return [
            'sent'         => false,
            'provider'     => 'local_sandbox',
            'sandbox_mode' => true,
            'error'        => 'RESEND_API_KEY is not configured.',
            'code'         => $code,
        ];
    }

    /**
     * Dispatch an alert notification email via Resend API.
     */
    public static function sendAlert(Notification $notification, User $recipient): bool
    {
        $resendKey = self::getApiKey();
        if (empty($resendKey)) {
            Log::info("Alert notification #{$notification->notification_id} skipped email dispatch (RESEND_API_KEY not configured)");
            return false;
        }

        $subject = match ($notification->severity) {
            'critical' => '🚨 CRITICAL: ' . $notification->title,
            'warning'  => '⚠️ WARNING: ' . $notification->title,
            default    => 'ℹ️ INFO: ' . $notification->title,
        };

        $html = view('emails.alert-notification', [
            'notification'  => $notification,
            'recipientName' => $recipient->fullName(),
        ])->render();

        $from = self::resolveFromAddress();

        $res = self::sendViaResend($resendKey, $from, $recipient->email, $subject, $html);

        if (!$res['success']) {
            Log::warning("Failed to dispatch alert email via Resend to {$recipient->email}: " . ($res['error'] ?? 'unknown'));
            return false;
        }

        return true;
    }

    /**
     * Send email via Resend REST API (HTTPS port 443).
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

            $errorMsg = $response->json('message') ?? $response->body();
            return [
                'success' => false,
                'error'   => $errorMsg,
            ];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Resolve valid Resend sender address.
     * Resend strictly requires onboarding@resend.dev unless a custom verified domain is used.
     * Free webmail domains (gmail.com, yahoo.com) cannot be used as the sender on Resend.
     */
    public static function resolveFromAddress(): string
    {
        $explicit = config('services.resend.from') ?: env('RESEND_FROM_ADDRESS');
        if (!empty($explicit) && !str_contains($explicit, '@gmail.com') && !str_contains($explicit, '@yahoo.com')) {
            return $explicit;
        }

        $addr = config('mail.from.address');
        $name = config('mail.from.name', 'ArmoryDB');

        if (empty($addr) || str_contains($addr, 'gmail.com') || str_contains($addr, 'yahoo.com') || str_contains($addr, 'example.com')) {
            return "{$name} <onboarding@resend.dev>";
        }

        return "{$name} <{$addr}>";
    }
}
