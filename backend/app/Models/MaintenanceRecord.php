<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MaintenanceRecord extends Model
{
    use HasFactory;

    protected $primaryKey = 'maintenance_id';

    protected $fillable = [
        'equipment_id',
        'performed_by',
        'description',
        'maintenance_date',
        'next_schedule',
        'condition_before',
        'condition_after',
        'maintenance_type',
        'cost',
        'parts_replaced',
        'remarks',
    ];

    protected $casts = [
        'maintenance_date' => 'datetime',
        'next_schedule'    => 'datetime',
        'parts_replaced'   => 'array',
        'cost'             => 'decimal:2',
    ];

    public function firearm(): BelongsTo
    {
        return $this->belongsTo(FirearmEquipment::class, 'equipment_id', 'equipment_id');
    }

    public function technician(): BelongsTo
    {
        return $this->belongsTo(User::class, 'performed_by', 'user_id');
    }
}
