<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class EquipmentCategory extends Model
{
    use HasFactory;

    protected $primaryKey = 'category_id';
    protected $fillable = ['category_code', 'category_name', 'description'];

    public const FIREARM    = 1;
    public const AMMUNITION = 2;
    public const GEAR       = 3;

    public function firearms(): HasMany
    {
        return $this->hasMany(FirearmEquipment::class, 'category_id', 'category_id');
    }
}
