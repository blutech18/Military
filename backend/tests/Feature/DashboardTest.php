<?php

namespace Tests\Feature;

use App\Models\FirearmEquipment;
use App\Models\Role;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    public function test_dashboard_summary_requires_auth(): void
    {
        $this->getJson('/api/v1/dashboard/summary')->assertStatus(401);
    }

    public function test_dashboard_summary_returns_kpi(): void
    {
        Sanctum::actingAs(User::where('username', 'admin')->first(), ['Administrator']);

        $response = $this->getJson('/api/v1/dashboard/summary');
        $response->assertOk()
            ->assertJsonStructure([
                'kpi' => ['total_firearms', 'available', 'checked_out', 'maintenance', 'overdue'],
                'by_condition',
                'by_status',
                'recent_transactions',
                'recent_audit',
            ]);
    }

    public function test_global_search(): void
    {
        Sanctum::actingAs(User::where('username', 'admin')->first(), ['Administrator']);

        $response = $this->getJson('/api/v1/search?q=M4');
        $response->assertOk()
            ->assertJsonStructure(['firearms', 'users', 'transactions']);
        $this->assertGreaterThan(0, count($response->json('firearms')));
    }

    public function test_global_search_short_query(): void
    {
        Sanctum::actingAs(User::where('username', 'admin')->first(), ['Administrator']);

        $response = $this->getJson('/api/v1/search?q=X');
        $response->assertOk()
            ->assertJson(['firearms' => [], 'users' => [], 'transactions' => []]);
    }

    public function test_personnel_global_search_is_ownership_scoped_and_hides_users(): void
    {
        $personnel = User::where('username', 'pvt.dela.cruz')->firstOrFail();
        $otherPersonnel = User::where('username', 'cpl.santos')->firstOrFail();
        $authorizer = User::where('username', 'armory.custodian')->firstOrFail();
        $firearms = FirearmEquipment::where('availability_status', FirearmEquipment::STATUS_AVAILABLE)
            ->limit(2)
            ->get();
        $firearms[0]->update(['serial_number' => 'OWN-SCOPETEST-001']);
        $firearms[1]->update(['serial_number' => 'OTHER-SCOPETEST-002']);

        $own = Transaction::create([
            'equipment_id' => $firearms[0]->equipment_id,
            'user_id' => $personnel->user_id,
            'authorized_by' => $authorizer->user_id,
            'checkout_at' => now(),
            'expected_return_at' => now()->addHours(4),
            'purpose' => Transaction::PURPOSE_TRAINING,
            'status' => Transaction::STATUS_ACTIVE,
            'condition_on_issue' => FirearmEquipment::CONDITION_GOOD,
            'gps_tracking_enabled' => true,
        ]);
        $other = Transaction::create([
            'equipment_id' => $firearms[1]->equipment_id,
            'user_id' => $otherPersonnel->user_id,
            'authorized_by' => $authorizer->user_id,
            'checkout_at' => now(),
            'expected_return_at' => now()->addHours(4),
            'purpose' => Transaction::PURPOSE_TRAINING,
            'status' => Transaction::STATUS_ACTIVE,
            'condition_on_issue' => FirearmEquipment::CONDITION_GOOD,
            'gps_tracking_enabled' => true,
        ]);
        $firearms[0]->update(['availability_status' => FirearmEquipment::STATUS_CHECKED_OUT]);
        $firearms[1]->update(['availability_status' => FirearmEquipment::STATUS_CHECKED_OUT]);

        Sanctum::actingAs($personnel, [Role::PERSONNEL]);
        $response = $this->getJson('/api/v1/search?q=SCOPETEST')->assertOk();

        $this->assertSame([], $response->json('users'));
        $this->assertSame([$firearms[0]->equipment_id], collect($response->json('firearms'))->pluck('equipment_id')->all());
        $transactionIds = collect($response->json('transactions'))->pluck('transaction_id');
        $this->assertTrue($transactionIds->contains($own->transaction_id));
        $this->assertFalse($transactionIds->contains($other->transaction_id));
    }

    public function test_unknown_role_is_denied_broad_operational_reads(): void
    {
        config(['armory.rate_limit_per_second' => 100]);

        $unknownRole = Role::create([
            'role_name' => 'Temporary Observer',
            'description' => 'Test-only unapproved role',
        ]);
        $user = User::where('username', 'pvt.dela.cruz')->firstOrFail();
        $user->update([
            'role_id' => $unknownRole->role_id,
            'security_clearance' => User::CLEARANCE_TOP_SECRET,
        ]);
        $user->unsetRelation('role');
        Sanctum::actingAs($user, ['Temporary Observer']);

        $this->getJson('/api/v1/search?q=M4')->assertForbidden();
        $this->getJson('/api/v1/dashboard/summary')->assertForbidden();
        $this->getJson('/api/v1/firearms')->assertForbidden();
        $this->getJson('/api/v1/transactions')->assertForbidden();
        $this->getJson('/api/v1/maintenance')->assertForbidden();
        $this->getJson('/api/v1/audit-logs')->assertForbidden();
    }
}
