<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            ['role_name' => Role::ADMIN,            'description' => 'Full system control: users, settings, audits.'],
            ['role_name' => Role::COMMAND_OFFICER,  'description' => 'View-all dashboards, reports, situational awareness.'],
            ['role_name' => Role::S4_OFFICER,       'description' => 'Logistics: approve/record issuance, returns, stocks.'],
            ['role_name' => Role::ARMORY_CUSTODIAN, 'description' => 'Day-to-day firearm tag/issue/return; QR scanning.'],
            ['role_name' => Role::PERSONNEL,        'description' => 'Authenticate, view assigned firearm, return.'],
        ];

        foreach ($roles as $row) {
            Role::updateOrCreate(['role_name' => $row['role_name']], $row);
        }
    }
}
