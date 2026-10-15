<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        $roles = [
            ['role_name' => Role::ADMIN,            'description' => 'System account: users, settings, audits, technical support.'],
            ['role_name' => Role::COMMAND_OFFICER,  'description' => 'Oversees the whole system; manages users; approves S4 requests.'],
            ['role_name' => Role::S4_OFFICER,       'description' => 'Logistics: requests new firearms and repair budgets from the Command Officer.'],
            ['role_name' => Role::ARMORY_CUSTODIAN, 'description' => 'Releases and receives firearms; checks firearms that need repair.'],
            ['role_name' => Role::PERSONNEL,        'description' => 'Borrows firearms; sees only their own issued firearm.'],
        ];

        foreach ($roles as $row) {
            Role::updateOrCreate(['role_name' => $row['role_name']], $row);
        }
    }
}
