<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;

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

        EmailDeliveryService::sendAlert($notification, $user);
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
            EmailDeliveryService::sendAlert($notification, $admin);
        }
    }
}
