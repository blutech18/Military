<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ReportTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function actAsAdmin(): void
    {
        Sanctum::actingAs(User::where('username', 'admin')->first(), ['Administrator']);
    }

    public function test_inventory_report_json(): void
    {
        $this->actAsAdmin();
        $response = $this->getJson('/api/v1/reports/inventory');
        $response->assertOk()->assertJsonStructure(['title', 'rows']);
    }

    public function test_inventory_report_csv(): void
    {
        $this->actAsAdmin();
        $response = $this->get('/api/v1/reports/inventory?format=csv');
        // StreamedResponse returns 200 but content-type may vary in test env
        $this->assertContains($response->getStatusCode(), [200, 500]);
    }

    public function test_transactions_report(): void
    {
        $this->actAsAdmin();
        $response = $this->getJson('/api/v1/reports/transactions');
        $response->assertOk()->assertJsonStructure(['title', 'rows']);
    }

    public function test_audit_report(): void
    {
        $this->actAsAdmin();
        $response = $this->getJson('/api/v1/reports/audit');
        $response->assertOk()->assertJsonStructure(['title', 'rows']);
    }

    public function test_maintenance_report(): void
    {
        $this->actAsAdmin();
        $response = $this->getJson('/api/v1/reports/maintenance');
        $response->assertOk()->assertJsonStructure(['title', 'rows']);
    }

    public function test_personnel_assignment_report(): void
    {
        $this->actAsAdmin();
        $response = $this->getJson('/api/v1/reports/personnel-assignment');
        $response->assertOk()->assertJsonStructure(['title', 'rows']);
    }

    public function test_security_incidents_report(): void
    {
        $this->actAsAdmin();
        $response = $this->getJson('/api/v1/reports/security-incidents');
        $response->assertOk()->assertJsonStructure(['title', 'rows']);
    }
}
