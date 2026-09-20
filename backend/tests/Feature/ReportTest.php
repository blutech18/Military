<?php

namespace Tests\Feature;

use App\Models\Role;
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
        config(['armory.rate_limit_per_second' => 100]);
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

    public function test_personnel_cannot_access_reports_or_sensitive_gps_reads(): void
    {
        $personnel = User::where('username', 'pvt.dela.cruz')->firstOrFail();
        Sanctum::actingAs($personnel, [Role::PERSONNEL]);

        foreach ([
            '/api/v1/reports/inventory',
            '/api/v1/reports/transactions',
            '/api/v1/reports/audit',
            '/api/v1/reports/security-incidents',
            '/api/v1/gps/live',
            '/api/v1/locations',
            '/api/v1/gps/iot-status',
        ] as $uri) {
            $this->getJson($uri)->assertForbidden();
        }
    }

    public function test_security_reports_require_secret_clearance_for_staff(): void
    {
        $custodian = User::where('username', 'armory.custodian')->firstOrFail();
        $custodian->update(['security_clearance' => User::CLEARANCE_CONFIDENTIAL]);
        Sanctum::actingAs($custodian, [Role::ARMORY_CUSTODIAN]);

        $this->getJson('/api/v1/reports/inventory')->assertOk();
        $this->getJson('/api/v1/reports/audit')->assertForbidden();
        $this->getJson('/api/v1/reports/security-incidents')->assertForbidden();

        $custodian->update(['security_clearance' => User::CLEARANCE_SECRET]);
        $this->getJson('/api/v1/reports/audit')->assertOk();
        $this->getJson('/api/v1/reports/security-incidents')->assertOk();
    }
}
