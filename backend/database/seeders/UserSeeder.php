<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class UserSeeder extends Seeder
{
    public function run(): void
    {
        $roles = Role::all()->keyBy('role_name');

        // Default seeder password - override via SEED_DEFAULT_PASSWORD env variable
        $defaultPassword = env('SEED_DEFAULT_PASSWORD', 'Password@2025!');

        $users = [
            [
                'username'           => 'admin',
                'email'              => 'admin@10rcdg.mil.ph',
                'first_name'         => 'System',
                'last_name'          => 'Administrator',
                'rank'               => 'CIV',
                'phone'              => '09171000001',
                'role'               => Role::ADMIN,
                'security_clearance' => User::CLEARANCE_TOP_SECRET,
            ],
            [
                'username'           => 'cmd.officer',
                'email'              => 'cmd.officer@10rcdg.mil.ph',
                'first_name'         => 'Mateo',
                'last_name'          => 'Bautista',
                'rank'               => 'COL',
                'phone'              => '09171000002',
                'role'               => Role::COMMAND_OFFICER,
                'security_clearance' => User::CLEARANCE_TOP_SECRET,
            ],
            [
                'username'           => 's4.officer',
                'email'              => 's4@10rcdg.mil.ph',
                'first_name'         => 'Joana',
                'last_name'          => 'Reyes',
                'rank'               => 'CPT',
                'phone'              => '09171000003',
                'role'               => Role::S4_OFFICER,
                'security_clearance' => User::CLEARANCE_SECRET,
            ],
            [
                'username'           => 'armory.custodian',
                'email'              => 'armory@10rcdg.mil.ph',
                'first_name'         => 'Rafael',
                'last_name'          => 'Salazar',
                'rank'               => 'SSG',
                'phone'              => '09171000004',
                'role'               => Role::ARMORY_CUSTODIAN,
                'security_clearance' => User::CLEARANCE_SECRET,
            ],
            [
                'username'           => 'pvt.dela.cruz',
                'email'              => 'dela.cruz@10rcdg.mil.ph',
                'first_name'         => 'Juan',
                'last_name'          => 'Dela Cruz',
                'rank'               => 'PVT',
                'phone'              => '09171000005',
                'role'               => Role::PERSONNEL,
                'security_clearance' => User::CLEARANCE_CONFIDENTIAL,
            ],
            [
                'username'           => 'cpl.santos',
                'email'              => 'santos@10rcdg.mil.ph',
                'first_name'         => 'Miguel',
                'last_name'          => 'Santos',
                'rank'               => 'CPL',
                'phone'              => '09171000006',
                'role'               => Role::PERSONNEL,
                'security_clearance' => User::CLEARANCE_CONFIDENTIAL,
            ],
        ];

        foreach ($users as $row) {
            $role = $roles[$row['role']];

            User::updateOrCreate(
                ['username' => $row['username']],
                [
                    'role_id'              => $role->role_id,
                    'email'                => $row['email'],
                    'password'             => Hash::make($defaultPassword),
                    'first_name'           => $row['first_name'],
                    'last_name'            => $row['last_name'],
                    'rank'                 => $row['rank'],
                    'phone'                => $row['phone'],
                    'security_clearance'   => $row['security_clearance'],
                    'status'               => User::STATUS_ACTIVE,
                    'totp_enabled'         => false,
                    'biometric_enrolled'   => false,
                ]
            );
        }
    }
}
