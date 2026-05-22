<?php

namespace App\Services;

use App\Mail\AlertNotification;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Dispatches email alerts for critical and warning notifications.
 * Called after a Notification is created when email delivery is warranted.
 */
class AlertDispatcher
{
    /**
     * Send email alert for a notification if severity warrants it.
     * Only sends for 'critical' and 'warning' severity levels.
     */
    public static function dispatch(Notification $notification): void
    {
        if (!in_array($notification->severity, [Notification::SEVERITY_CRITICAL, Notification::SEVERITY_WARNING])) {
            return;
        }

        $user = User::find($notification->user_id);
        if (!$user || !$user->email) {
            return;
        }

        try {
            Mail::to($user->email)->queue(new AlertNotification($notification, $user->fullName()));
        } catch (\Throwable $e) {
            Log::warning("AlertDispatcher: Failed to queue email for notification #{$notification->notification_id}", [
                'error' => $e->getMessage(),
                'user_id' => $notification->user_id,
            ]);
        }
    }

    /**
     * Notify all administrators about a critical event.
     */
    public static function notifyAdmins(Notification $notification): void
    {
        $admins = User::whereHas('role', fn($q) => $q->where('role_name', 'Administrator'))
            ->where('status', User::STATUS_ACTIVE)
            ->get();

        foreach ($admins as $admin) {
            try {
                Mail::to($admin->email)->queue(new AlertNotification($notification, $admin->fullName()));
            } catch (\Throwable $e) {
                Log::warning("AlertDispatcher: Failed to email admin {$admin->username}", [
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }
}
