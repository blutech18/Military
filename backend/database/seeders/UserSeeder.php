<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Seeds the baseline account for each role.
 *
 * Passwords are owned by the database, not by configuration. Each account gets
 * a cryptographically random password on creation, printed once so the operator
 * can capture it, and existing accounts are never re-hashed. That means running
 * this seeder against a live environment can update profile data but can never
 * reset or weaken a credential that is already in use.
 */
class UserSeeder extends Seeder
{
    public function run(): void
    {
        $roles = Role::all()->keyBy('role_name');

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

        $created = [];

        foreach ($users as $row) {
            $role = $roles[$row['role']];

            $attributes = [
                'role_id'            => $role->role_id,
                'email'              => $row['email'],
                'first_name'         => $row['first_name'],
                'last_name'          => $row['last_name'],
                'rank'               => $row['rank'],
                'phone'              => $row['phone'],
                'security_clearance' => $row['security_clearance'],
            ];

            $user = User::where('username', $row['username'])->first();

            if ($user) {
                // Profile data may be corrected; the stored credential is left alone.
                $user->fill($attributes)->save();

                continue;
            }

            $password = Str::password(20);

            User::create($attributes + [
                'username'           => $row['username'],
                'password'           => Hash::make($password),
                'status'             => User::STATUS_ACTIVE,
                'totp_enabled'       => false,
                'biometric_enrolled' => false,
            ]);

            $created[] = [$row['username'], $password];
        }

        $this->report($created);
    }

    /**
     * Print generated credentials once. They are not recoverable afterwards,
     * because only the hash is persisted.
     */
    private function report(array $created): void
    {
        if (! $this->command) {
            return;
        }

        if ($created === []) {
            $this->command->info('All baseline accounts already exist. No passwords were changed.');

            return;
        }

        $this->command->warn('Generated one-time passwords. Record them now and change them after first login:');
        $this->command->table(['Username', 'Password'], $created);
    }
}
