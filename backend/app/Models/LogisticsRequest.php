<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A request from the S4 Officer to the Command Officer: new firearms, or the budget to repair
 * the firearms that need it.
 */
class LogisticsRequest extends Model
{
    protected $primaryKey = 'request_id';

    public const TYPE_NEW_FIREARM   = 'new_firearm';
    public const TYPE_REPAIR_BUDGET = 'repair_budget';

    public const STATUS_PENDING  = 'pending';
    public const STATUS_APPROVED = 'approved';
    public const STATUS_REJECTED = 'rejected';

    protected $fillable = [
        'type',
        'title',
        'details',
        'quantity',
        'estimated_cost',
        'items',
        'status',
        'requested_by',
        'decided_by',
        'decided_at',
        'decision_note',
    ];

    protected $casts = [
        'items'          => 'array',
        'quantity'       => 'integer',
        'estimated_cost' => 'integer',
        'decided_at'     => 'datetime',
    ];

    public function requester(): BelongsTo
    {
        return $this->belongsTo(User::class, 'requested_by', 'user_id');
    }

    public function decider(): BelongsTo
    {
        return $this->belongsTo(User::class, 'decided_by', 'user_id');
    }

    public function typeLabel(): string
    {
        return $this->type === self::TYPE_NEW_FIREARM ? 'New Firearm' : 'Repair Budget';
    }
}
