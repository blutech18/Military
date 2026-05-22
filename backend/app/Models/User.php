<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    use HasApiTokens, HasFactory, Notifiable, SoftDeletes;

    protected $primaryKey = 'user_id';

    public const CLEARANCE_CONFIDENTIAL = 1;
    public const CLEARANCE_SECRET       = 2;
    public const CLEARANCE_TOP_SECRET   = 3;

    public const STATUS_ACTIVE   = 1;
    public const STATUS_INACTIVE = 0;

    protected $fillable = [
        'role_id',
        'username',
        'email',
        'password',
        'first_name',
        'last_name',
        'rank',
        'phone',
        'biometric_data',
        'security_clearance',
        'status',
        'totp_secret',
        'totp_enabled',
        'biometric_enrolled',
        'failed_login_attempts',
        'last_login_at',
        'last_login_ip',
        'locked_until',
    ];

    protected $hidden = [
        'password',
        'remember_token',
        'biometric_data',
        'totp_secret',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'last_login_at'     => 'datetime',
            'locked_until'      => 'datetime',
            'password'          => 'hashed',
            'biometric_data'    => 'encrypted',
            'totp_secret'       => 'encrypted',
            'totp_enabled'      => 'boolean',
            'biometric_enrolled'=> 'boolean',
            'security_clearance'=> 'integer',
            'status'            => 'integer',
        ];
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class, 'role_id', 'role_id');
    }

    public function transactions(): HasMany
    {
        return $this->hasMany(Transaction::class, 'user_id', 'user_id');
    }

    public function authorizedTransactions(): HasMany
    {
        return $this->hasMany(Transaction::class, 'authorized_by', 'user_id');
    }

    public function maintenanceRecords(): HasMany
    {
        return $this->hasMany(MaintenanceRecord::class, 'performed_by', 'user_id');
    }

    public function notifications(): HasMany
    {
        return $this->hasMany(Notification::class, 'user_id', 'user_id');
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class, 'user_id', 'user_id');
    }

    public function fullName(): string
    {
        return trim("{$this->rank} {$this->first_name} {$this->last_name}");
    }

    public function hasRole(string $name): bool
    {
        return optional($this->role)->role_name === $name;
    }

    public function isAdmin(): bool
    {
        return $this->hasRole(Role::ADMIN);
    }

    public function isLocked(): bool
    {
        return $this->locked_until !== null && now()->lt($this->locked_until);
    }
}
