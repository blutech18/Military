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

    public function users(): HasMany
    {
        return $this->hasMany(User::class, 'role_id', 'role_id');
    }
}
