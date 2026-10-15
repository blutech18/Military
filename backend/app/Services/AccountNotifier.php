<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

/**
 * Account security notifications: failed sign-ins, new sign-ins and account changes.
 *
 * The account owner hears about everything on their own account. Administrators and
 * Command Officers also hear about failed sign-ins, at most once per account (or per
 * address, for unknown usernames) every 10 minutes so a burst of attempts is one alert.
 */
class AccountNotifier
{
    private const OVERSIGHT_THROTTLE_MINUTES = 10;

    /** @param string $what e.g. "password", "TOTP code", "fingerprint" */
    public static function failedLogin(?User $user, Request $request, string $what, ?string $attemptedName = null): void
    {
        $from = self::where($request);

        if ($user) {
            self::send([
                'user_id'  => $user->user_id,
                'type'     => 'failed_login',
                'severity' => Notification::SEVERITY_WARNING,
                'title'    => 'Failed Sign-in Attempt',
                'message'  => "A wrong {$what} was entered for your account {$from}. If this was not you, tell an administrator.",
                'payload'  => ['ip' => $request->ip(), 'stage' => $what, 'time' => now()->toIso8601String()],
            ]);
        }

        $key = 'notify-failed-login:' . ($user ? "user:{$user->user_id}" : 'ip:' . $request->ip());
        if (! Cache::add($key, true, now()->addMinutes(self::OVERSIGHT_THROTTLE_MINUTES))) {
            return;
        }

        $who = $user ? "{$user->fullName()} (@{$user->username})" : 'unknown account "' . mb_substr((string) $attemptedName, 0, 60) . '"';
        try {
            Notification::notifyRoles([
                'type'     => 'failed_login',
                'severity' => Notification::SEVERITY_WARNING,
                'title'    => 'Failed Sign-in',
                'message'  => "Failed sign-in for {$who}: wrong {$what} {$from}.",
                'payload'  => ['ip' => $request->ip(), 'stage' => $what, 'target_user_id' => $user?->user_id],
            ], [Role::ADMIN, Role::COMMAND_OFFICER], exceptUserIds: [$user?->user_id]); // the owner was told above
        } catch (\Throwable $e) {
            Log::warning('Failed-login oversight notification failed: ' . $e->getMessage());
        }
    }

    public static function newLogin(User $user, Request $request): void
    {
        self::send([
            'user_id'  => $user->user_id,
            'type'     => 'new_login',
            'severity' => Notification::SEVERITY_INFO,
            'title'    => 'New Sign-in',
            'message'  => 'You signed in ' . self::where($request) . ' using ' . self::device($request) . '.',
            'payload'  => ['ip' => $request->ip(), 'time' => now()->toIso8601String()],
        ]);
    }

    /**
     * @param string[] $changed human-readable list of what changed, e.g. ["role", "email"]
     */
    public static function accountChanged(User $user, ?User $actor, array $changed, Request $request): void
    {
        if (! $changed) {
            return;
        }
        $by = $actor && $actor->user_id !== $user->user_id ? " by {$actor->fullName()}" : '';

        self::send([
            'user_id'  => $user->user_id,
            'type'     => 'account_change',
            'severity' => Notification::SEVERITY_WARNING,
            'title'    => 'Account Changed',
            'message'  => 'Your account was changed' . $by . ': ' . implode(', ', $changed) . '.',
            'payload'  => ['changed' => array_values($changed), 'actor_user_id' => $actor?->user_id, 'ip' => $request->ip()],
        ]);
    }

    private static function send(array $attributes): void
    {
        try {
            Notification::create($attributes);
        } catch (\Throwable $e) {
            // A notification (or its e-mail) must never break sign-in.
            Log::warning("Account notification '{$attributes['type']}' failed: " . $e->getMessage());
        }
    }

    private static function where(Request $request): string
    {
        return 'from ' . ($request->ip() ?? 'an unknown address');
    }

    /** "Chrome on Windows" from the user agent, without pulling in a parser library. */
    private static function device(Request $request): string
    {
        $ua = (string) $request->userAgent();
        $browser = match (true) {
            str_contains($ua, 'Edg/')     => 'Edge',
            str_contains($ua, 'OPR/')     => 'Opera',
            str_contains($ua, 'Chrome/')  => 'Chrome',
            str_contains($ua, 'Firefox/') => 'Firefox',
            str_contains($ua, 'Safari/')  => 'Safari',
            default                       => 'a browser',
        };
        $os = match (true) {
            str_contains($ua, 'Windows')   => 'Windows',
            str_contains($ua, 'Android')   => 'Android',
            str_contains($ua, 'iPhone'), str_contains($ua, 'iPad') => 'iOS',
            str_contains($ua, 'Mac OS X')  => 'macOS',
            str_contains($ua, 'Linux')     => 'Linux',
            default                        => null,
        };
        return $os ? "{$browser} on {$os}" : $browser;
    }
}
