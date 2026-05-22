<?php

namespace Tests\Feature;

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
}
