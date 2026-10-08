<?php

use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Staff accounts created with the form's old "Confidential" default could not open the Audit
 * Trail or the security reports their role is meant to have: the menu showed the pages, the API
 * refused them, and each refusal was recorded as a clearance violation. Raise every account that
 * sits below its role's minimum to that role's default clearance (Role::CLEARANCE_POLICY).
 * Accounts that already meet the minimum are left as they are.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (Role::CLEARANCE_POLICY as $roleName => $policy) {
            $roleId = DB::table('roles')->where('role_name', $roleName)->value('role_id');
            if (! $roleId) {
                continue;
            }

            DB::table('users')
                ->where('role_id', $roleId)
                ->where('security_clearance', '<', $policy['min'])
                ->update(['security_clearance' => $policy['default'], 'updated_at' => now()]);
        }
    }

    public function down(): void
    {
        // Irreversible on purpose: the previous (too low) values are not worth restoring.
    }
};
