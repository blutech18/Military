<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Role extends Model
{
    use HasFactory;

    protected $primaryKey = 'role_id';
    protected $fillable = ['role_name', 'description'];

    public const ADMIN = 'Administrator';
    public const COMMAND_OFFICER = 'Command Officer';
    public const S4_OFFICER = 'S4 Officer';
    public const ARMORY_CUSTODIAN = 'Armory Custodian';
    public const PERSONNEL = 'Personnel';

    /**
     * Security clearance each role must hold, and the level a new account gets by default.
     *
     * Every staff role can open the Audit Trail and the security reports, which the API guards
     * with clearance:2 (Secret). A staff account below Secret is therefore broken: the menu shows
     * pages the API refuses, and every refusal is logged as a clearance violation.
     */
    public const CLEARANCE_POLICY = [
        self::ADMIN            => ['min' => User::CLEARANCE_SECRET,       'default' => User::CLEARANCE_TOP_SECRET],
        self::COMMAND_OFFICER  => ['min' => User::CLEARANCE_SECRET,       'default' => User::CLEARANCE_TOP_SECRET],
        self::S4_OFFICER       => ['min' => User::CLEARANCE_SECRET,       'default' => User::CLEARANCE_SECRET],
        self::ARMORY_CUSTODIAN => ['min' => User::CLEARANCE_SECRET,       'default' => User::CLEARANCE_SECRET],
        self::PERSONNEL        => ['min' => User::CLEARANCE_CONFIDENTIAL, 'default' => User::CLEARANCE_CONFIDENTIAL],
    ];

    protected $appends = ['min_clearance', 'default_clearance'];

    public function getMinClearanceAttribute(): int
    {
        return self::CLEARANCE_POLICY[$this->role_name]['min'] ?? User::CLEARANCE_CONFIDENTIAL;
    }

    public function getDefaultClearanceAttribute(): int
    {
        return self::CLEARANCE_POLICY[$this->role_name]['default'] ?? User::CLEARANCE_CONFIDENTIAL;
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'role_id', 'role_id');
    }
}
