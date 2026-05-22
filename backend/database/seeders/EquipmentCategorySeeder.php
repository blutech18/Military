<?php

namespace Database\Seeders;

use App\Models\EquipmentCategory;
use Illuminate\Database\Seeder;

class EquipmentCategorySeeder extends Seeder
{
    public function run(): void
    {
        $categories = [
            ['category_code' => EquipmentCategory::FIREARM,    'category_name' => 'Firearm',    'description' => 'Service rifles, pistols, shotguns, and crew-served weapons.'],
            ['category_code' => EquipmentCategory::AMMUNITION, 'category_name' => 'Ammunition', 'description' => 'Rounds, cartridges, magazines, and pyrotechnics.'],
            ['category_code' => EquipmentCategory::GEAR,       'category_name' => 'Tactical Gear', 'description' => 'Body armor, communications, optics, and load-bearing equipment.'],
        ];

        foreach ($categories as $row) {
            EquipmentCategory::updateOrCreate(['category_code' => $row['category_code']], $row);
        }
    }
}
