<?php

namespace App\Models;

use App\Services\AlertDispatcher;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Notification extends Model
{
    use HasFactory;

    protected $primaryKey = 'notification_id';

    public const SEVERITY_INFO     = 'info';
    public const SEVERITY_WARNING  = 'warning';
    public const SEVERITY_CRITICAL = 'critical';

    public const STATUS_UNREAD       = 'Unread';
    public const STATUS_READ         = 'Read';
    public const STATUS_ACKNOWLEDGED = 'Acknowledged';

    protected $fillable = [
        'user_id',
        'equipment_id',
        'type',
        'severity',
        'title',
        'message',
        'payload',
        'status',
        'read_at',
    ];

    protected $casts = [
        'payload' => 'array',
        'read_at' => 'datetime',
    ];

    /** Not stored: set before saving to keep a notification in-app only, without the e-mail. */
    public bool $withoutEmail = false;

    protected static function booted(): void
    {
        static::created(function (Notification $notification) {
            // Dispatch email alert for critical/warning notifications
            if (! $notification->withoutEmail) {
                AlertDispatcher::dispatch($notification);
            }
        });
    }

    /** Roles that watch over every firearm and get its security alerts. */
    public const OVERSIGHT_ROLES = [Role::ADMIN, Role::COMMAND_OFFICER, Role::ARMORY_CUSTODIAN];

    /**
     * One in-app notification per active user in the given roles, plus any extra user ids.
     *
     * Only the users in $emailUserIds also get the e-mail. Alert e-mails are sent while the
     * request waits, so fanning one out to every officer would slow down whatever raised it
     * (a sign-in, or a GPS report from a tracker with an 8-second timeout).
     *
     * @return int number of notifications created
     */
    public static function notifyRoles(
        array $attributes,
        array $roles = self::OVERSIGHT_ROLES,
        array $alsoUserIds = [],
        array $emailUserIds = [],
        array $exceptUserIds = [],
    ): int {
        $except = array_map('intval', array_filter($exceptUserIds));
        $email  = array_map('intval', array_filter($emailUserIds));

        $ids = User::where('status', User::STATUS_ACTIVE)
            ->whereHas('role', fn($q) => $q->whereIn('role_name', $roles))
            ->pluck('user_id')
            ->merge(array_filter($alsoUserIds))
            ->map(fn($id) => (int) $id)
            ->unique()
            ->reject(fn($id) => in_array($id, $except, true))
            ->values();

        foreach ($ids as $id) {
            $notification = new static($attributes + ['user_id' => $id]);
            $notification->withoutEmail = ! in_array($id, $email, true);
            $notification->save();
        }
        return $ids->count();
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    public function firearm(): BelongsTo
    {
        return $this->belongsTo(FirearmEquipment::class, 'equipment_id', 'equipment_id');
    }
}
