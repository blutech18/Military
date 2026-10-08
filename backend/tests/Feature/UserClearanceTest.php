<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class UserClearanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        Sanctum::actingAs(User::where('username', 'admin')->first(), ['Administrator']);
    }

    private function roleId(string $name): int
    {
        return Role::where('role_name', $name)->value('role_id');
    }

    private function newUser(string $role, int $clearance, string $username = 'new.user'): array
    {
        return [
            'username'           => $username,
            'email'              => "{$username}@10rcdg.mil.ph",
            'password'           => 'Strong-Passw0rd!',
            'first_name'         => 'New',
            'last_name'          => 'User',
            'rank'               => 'SGT',
            'role_id'            => $this->roleId($role),
            'security_clearance' => $clearance,
        ];
    }

    public function test_roles_endpoint_publishes_each_roles_minimum_and_default_clearance(): void
    {
        $roles = collect($this->getJson('/api/v1/users/roles')->assertOk()->json())->keyBy('role_name');

        $this->assertSame(['min' => 2, 'default' => 3], ['min' => $roles['Administrator']['min_clearance'], 'default' => $roles['Administrator']['default_clearance']]);
        $this->assertSame(2, $roles['Armory Custodian']['min_clearance']);
        $this->assertSame(1, $roles['Personnel']['min_clearance']);
    }

    public function test_staff_account_below_secret_is_refused_with_a_clear_message(): void
    {
        $this->postJson('/api/v1/users', $this->newUser(Role::ADMIN, User::CLEARANCE_CONFIDENTIAL))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['security_clearance'])
            ->assertJsonFragment(['security_clearance' => ['Administrator accounts need at least Secret clearance: the role includes the Audit Trail and security reports.']]);
    }

    public function test_accounts_meeting_their_roles_minimum_are_created(): void
    {
        $this->postJson('/api/v1/users', $this->newUser(Role::S4_OFFICER, User::CLEARANCE_SECRET, 's4.two'))->assertCreated();
        $this->postJson('/api/v1/users', $this->newUser(Role::PERSONNEL, User::CLEARANCE_CONFIDENTIAL, 'pvt.two'))->assertCreated();
    }

    public function test_editing_cannot_drop_a_staff_account_below_its_minimum(): void
    {
        $s4 = User::where('username', 's4.officer')->first();

        $this->patchJson("/api/v1/users/{$s4->user_id}", ['security_clearance' => User::CLEARANCE_CONFIDENTIAL])
            ->assertStatus(422)->assertJsonValidationErrors(['security_clearance']);
        $this->assertSame(User::CLEARANCE_SECRET, $s4->fresh()->security_clearance);
    }

    public function test_promoting_personnel_to_staff_requires_raising_clearance_too(): void
    {
        $pvt = User::where('username', 'pvt.dela.cruz')->first();

        $this->patchJson("/api/v1/users/{$pvt->user_id}", ['role_id' => $this->roleId(Role::S4_OFFICER)])
            ->assertStatus(422)->assertJsonValidationErrors(['security_clearance']);

        $this->patchJson("/api/v1/users/{$pvt->user_id}", [
            'role_id'            => $this->roleId(Role::S4_OFFICER),
            'security_clearance' => User::CLEARANCE_SECRET,
        ])->assertOk();
    }

    public function test_migration_raises_existing_staff_accounts_below_their_minimum(): void
    {
        $admin = User::where('username', 'admin')->first();
        $admin->forceFill(['security_clearance' => User::CLEARANCE_CONFIDENTIAL])->save();
        $pvt = User::where('username', 'pvt.dela.cruz')->first();

        $migration = require database_path('migrations/2026_10_08_000001_raise_clearance_to_role_minimum.php');
        $migration->up();

        $this->assertSame(User::CLEARANCE_TOP_SECRET, $admin->fresh()->security_clearance);
        $this->assertSame(User::CLEARANCE_CONFIDENTIAL, $pvt->fresh()->security_clearance, 'personnel are untouched');

        Sanctum::actingAs($admin->fresh(), ['Administrator']);
        $this->getJson('/api/v1/audit-logs')->assertOk();
    }
}
