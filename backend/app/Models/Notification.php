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

    protected static function booted(): void
    {
        static::created(function (Notification $notification) {
            // Dispatch email alert for critical/warning notifications
            AlertDispatcher::dispatch($notification);
        });
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
