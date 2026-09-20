<?php

namespace App\Services;

use App\Mail\AlertNotification;
use App\Mail\PasswordResetCode;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class EmailDeliveryService
{
    /**
     * Dispatch a 6-digit password reset verification email.
     *
     * Priority:
     * 1. Resend API (HTTPS port 443 - works on Railway & all cloud providers)
     * 2. Brevo API (HTTPS port 443)
     * 3. SendGrid API (HTTPS port 443)
     * 4. Standard Laravel Mail / SMTP (port 465 SSL, fallback port 587 TLS)
     *
     * If SMTP is blocked by the cloud provider's firewall (e.g. Railway connection timeout),
     * this returns smtp_blocked = true so the application can safely provide the testing code
     * without blocking user testing with a 503 error.
     *
     * @return array{sent: bool, provider: string, smtp_blocked: bool, error: ?string, code: ?string}
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

        // 1. Try Resend HTTPS API if configured
        if ($resendKey = env('RESEND_API_KEY')) {
            $from = env('RESEND_FROM_ADDRESS')
                ?: (config('mail.from.address') && !str_contains(config('mail.from.address'), 'gmail.com')
                    ? config('mail.from.name', 'ArmoryDB') . ' <' . config('mail.from.address') . '>'
                    : 'ArmoryDB <onboarding@resend.dev>');

            $response = self::sendViaResend($resendKey, $from, $user->email, $subject, $html);
            if ($response['success']) {
                Log::info("Password reset dispatched via Resend API to {$user->email}");
                return [
                    'sent'         => true,
                    'provider'     => 'resend',
                    'smtp_blocked' => false,
                    'error'        => null,
                    'code'         => null,
                ];
            }
            Log::warning("Resend API failed, falling back to next mailer: " . ($response['error'] ?? 'unknown'));
        }

        // 2. Try Brevo HTTPS API if configured
        if ($brevoKey = env('BREVO_API_KEY')) {
            $fromEmail = env('BREVO_FROM_EMAIL', config('mail.from.address', 'armorygps@gmail.com'));
            $fromName = config('mail.from.name', 'ArmoryDB System');

            $response = self::sendViaBrevo($brevoKey, $fromEmail, $fromName, $user->email, $subject, $html);
            if ($response['success']) {
                Log::info("Password reset dispatched via Brevo API to {$user->email}");
                return [
                    'sent'         => true,
                    'provider'     => 'brevo',
                    'smtp_blocked' => false,
                    'error'        => null,
                    'code'         => null,
                ];
            }
            Log::warning("Brevo API failed, falling back to next mailer: " . ($response['error'] ?? 'unknown'));
        }

        // 3. Try SendGrid HTTPS API if configured
        if ($sendgridKey = env('SENDGRID_API_KEY')) {
            $fromEmail = config('mail.from.address', 'armorygps@gmail.com');
            $fromName = config('mail.from.name', 'ArmoryDB System');

            $response = self::sendViaSendGrid($sendgridKey, $fromEmail, $fromName, $user->email, $subject, $html);
            if ($response['success']) {
                Log::info("Password reset dispatched via SendGrid API to {$user->email}");
                return [
                    'sent'         => true,
                    'provider'     => 'sendgrid',
                    'smtp_blocked' => false,
                    'error'        => null,
                    'code'         => null,
                ];
            }
            Log::warning("SendGrid API failed, falling back to next mailer: " . ($response['error'] ?? 'unknown'));
        }

        // 4. Try standard Laravel Mail / SMTP
        $mailDriver = config('mail.default');
        $smtpUser = config('mail.mailers.smtp.username');
        $smtpPass = config('mail.mailers.smtp.password');

        if ($mailDriver === 'log' || $mailDriver === 'array') {
            Mail::to($user->email)->send(new PasswordResetCode($user, $code, $ipAddress, $expiresMinutes));
            return [
                'sent'         => true,
                'provider'     => $mailDriver,
                'smtp_blocked' => false,
                'error'        => null,
                'code'         => null,
            ];
        }

        // If driver is smtp but credentials are completely missing
        if ($mailDriver === 'smtp' && (empty($smtpUser) || empty($smtpPass))) {
            return [
                'sent'         => false,
                'provider'     => 'smtp',
                'smtp_blocked' => false,
                'error'        => 'SMTP credentials (MAIL_USERNAME / MAIL_PASSWORD) are not configured.',
                'code'         => $code,
            ];
        }

        // Attempt SMTP delivery with port 465 SSL first, then port 587 TLS
        try {
            config([
                'mail.mailers.smtp.timeout' => (int) env('MAIL_TIMEOUT', 4),
            ]);
            Mail::to($user->email)->send(new PasswordResetCode($user, $code, $ipAddress, $expiresMinutes));
            return [
                'sent'         => true,
                'provider'     => 'smtp',
                'smtp_blocked' => false,
                'error'        => null,
                'code'         => null,
            ];
        } catch (\Throwable $e1) {
            $error1 = $e1->getMessage();
            Log::warning("Primary SMTP dispatch attempt failed: {$error1}");

            $isBlocked = self::isSmtpPortBlockedError($error1);

            // If error is NOT a host-level port block, try port 587 TLS fallback once
            if (! $isBlocked && (int) config('mail.mailers.smtp.port') === 465) {
                try {
                    config([
                        'mail.mailers.smtp.port'       => 587,
                        'mail.mailers.smtp.encryption' => 'tls',
                        'mail.mailers.smtp.timeout'    => 3,
                    ]);
                    Mail::purge('smtp');
                    Mail::to($user->email)->send(new PasswordResetCode($user, $code, $ipAddress, $expiresMinutes));
                    return [
                        'sent'         => true,
                        'provider'     => 'smtp_fallback_587',
                        'smtp_blocked' => false,
                        'error'        => null,
                        'code'         => null,
                    ];
                } catch (\Throwable $e2) {
                    $error1 = $e2->getMessage();
                    $isBlocked = self::isSmtpPortBlockedError($error1);
                    Log::warning("Fallback port 587 TLS attempt also failed: {$error1}");
                }
            }

            return [
                'sent'         => false,
                'provider'     => 'smtp',
                'smtp_blocked' => $isBlocked,
                'error'        => $error1,
                'code'         => $code,
            ];
        }
    }

    /**
     * Dispatch an alert notification email via available HTTP API or SMTP.
     */
    public static function sendAlert(Notification $notification, User $recipient): bool
    {
        $subject = match ($notification->severity) {
            'critical' => '🚨 CRITICAL: ' . $notification->title,
            'warning'  => '⚠️ WARNING: ' . $notification->title,
            default    => 'ℹ️ INFO: ' . $notification->title,
        };

        $html = view('emails.alert-notification', [
            'notification'  => $notification,
            'recipientName' => $recipient->fullName(),
        ])->render();

        // 1. Resend API
        if ($resendKey = env('RESEND_API_KEY')) {
            $from = env('RESEND_FROM_ADDRESS')
                ?: (config('mail.from.address') && !str_contains(config('mail.from.address'), 'gmail.com')
                    ? config('mail.from.name', 'ArmoryDB') . ' <' . config('mail.from.address') . '>'
                    : 'ArmoryDB <onboarding@resend.dev>');

            $res = self::sendViaResend($resendKey, $from, $recipient->email, $subject, $html);
            if ($res['success']) return true;
        }

        // 2. Brevo API
        if ($brevoKey = env('BREVO_API_KEY')) {
            $fromEmail = env('BREVO_FROM_EMAIL', config('mail.from.address', 'armorygps@gmail.com'));
            $fromName = config('mail.from.name', 'ArmoryDB System');
            $res = self::sendViaBrevo($brevoKey, $fromEmail, $fromName, $recipient->email, $subject, $html);
            if ($res['success']) return true;
        }

        // 3. Fall back to standard Mail queue
        try {
            Mail::to($recipient->email)->queue(new AlertNotification($notification, $recipient->fullName()));
            return true;
        } catch (\Throwable $e) {
            Log::warning("EmailDeliveryService: Failed to dispatch alert notification #{$notification->notification_id}", [
                'error' => $e->getMessage(),
            ]);
            return false;
        }
    }

    /**
     * Determine if an exception message indicates the cloud host has blocked outbound SMTP ports.
     */
    public static function isSmtpPortBlockedError(string $errorMessage): bool
    {
        $indicators = [
            'Connection timed out',
            'Connection refused',
            'stream_socket_client(): Unable to connect',
            'Network is unreachable',
            'Operation timed out',
            'Connection could not be established with host',
        ];

        foreach ($indicators as $needle) {
            if (stripos($errorMessage, $needle) !== false) {
                return true;
            }
        }

        return false;
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

            return [
                'success' => false,
                'error'   => $response->json('message') ?? $response->body(),
            ];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Send email via Brevo REST API (HTTPS port 443).
     *
     * @return array{success: bool, error: ?string}
     */
    protected static function sendViaBrevo(string $apiKey, string $fromEmail, string $fromName, string $to, string $subject, string $html): array
    {
        try {
            $response = Http::withHeaders([
                'api-key'      => $apiKey,
                'Content-Type' => 'application/json',
                'Accept'       => 'application/json',
            ])
            ->timeout(8)
            ->post('https://api.brevo.com/v3/smtp/email', [
                'sender'      => ['name' => $fromName, 'email' => $fromEmail],
                'to'          => [['email' => $to]],
                'subject'     => $subject,
                'htmlContent' => $html,
            ]);

            if ($response->successful()) {
                return ['success' => true, 'error' => null];
            }

            return [
                'success' => false,
                'error'   => $response->json('message') ?? $response->body(),
            ];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }

    /**
     * Send email via SendGrid REST API (HTTPS port 443).
     *
     * @return array{success: bool, error: ?string}
     */
    protected static function sendViaSendGrid(string $apiKey, string $fromEmail, string $fromName, string $to, string $subject, string $html): array
    {
        try {
            $response = Http::withToken($apiKey)
                ->timeout(8)
                ->post('https://api.sendgrid.com/v3/mail/send', [
                    'personalizations' => [
                        ['to' => [['email' => $to]]],
                    ],
                    'from' => ['email' => $fromEmail, 'name' => $fromName],
                    'subject' => $subject,
                    'content' => [
                        ['type' => 'text/html', 'value' => $html],
                    ],
                ]);

            if ($response->successful()) {
                return ['success' => true, 'error' => null];
            }

            return [
                'success' => false,
                'error'   => $response->body(),
            ];
        } catch (\Throwable $e) {
            return ['success' => false, 'error' => $e->getMessage()];
        }
    }
}
