<?php

use App\Models\Notification;
use Illuminate\Database\Migrations\Migration;

return new class extends Migration
{
    public function up(): void
    {
        // Mark any past lockout notifications as read so they do not linger as active alerts
        Notification::where('type', 'account_locked')
            ->where('status', Notification::STATUS_UNREAD)
            ->update([
                'status'  => Notification::STATUS_READ,
                'read_at' => now(),
            ]);
    }

    public function down(): void
    {
        // No-op
    }
};
