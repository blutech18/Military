<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AuditLog extends Model
{
    public $timestamps = false;
    protected $primaryKey = 'log_id';

    protected $fillable = [
        'user_id',
        'equipment_id',
        'action',
        'description',
        'role',
        'ip_address',
        'user_agent',
        'metadata',
        'created_at',
    ];

    protected $casts = [
        'metadata'   => 'array',
        'created_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class, 'user_id', 'user_id');
    }

    public function firearm(): BelongsTo
    {
        return $this->belongsTo(FirearmEquipment::class, 'equipment_id', 'equipment_id');
    }

    /**
     * Audit logs are append-only — block edits & deletes from the model layer.
     * (DB triggers should also enforce this in production.)
     */
    public function update(array $attributes = [], array $options = []): bool
    {
        throw new \RuntimeException('Audit logs are immutable.');
    }

    public function delete(): bool
    {
        throw new \RuntimeException('Audit logs are immutable.');
    }
}
