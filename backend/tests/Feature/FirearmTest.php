<?php

namespace Tests\Feature;

use App\Models\EquipmentCategory;
use App\Models\FirearmEquipment;
use App\Models\Role;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FirearmTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function actAsAdmin(): User
    {
        $user = User::where('username', 'admin')->first();
        Sanctum::actingAs($user, ['Administrator']);
        return $user;
    }

    private function actAsPersonnel(): User
    {
        $user = User::where('username', 'pvt.dela.cruz')->first();
        Sanctum::actingAs($user, ['Personnel']);
        return $user;
    }

    public function test_list_firearms_requires_auth(): void
    {
        $this->getJson('/api/v1/firearms')->assertStatus(401);
    }

    public function test_list_firearms_returns_paginated_results(): void
    {
        $this->actAsAdmin();
        $response = $this->getJson('/api/v1/firearms');

        $response->assertOk()
            ->assertJsonStructure(['data', 'current_page', 'total']);
    }

    public function test_search_firearms_by_serial(): void
    {
        $this->actAsAdmin();
        $response = $this->getJson('/api/v1/firearms?search=PA-M4');

        $response->assertOk();
        $this->assertGreaterThan(0, count($response->json('data')));
    }

    public function test_filter_firearms_by_status(): void
    {
        $this->actAsAdmin();
        $response = $this->getJson('/api/v1/firearms?availability_status=1');

        $response->assertOk();
        foreach ($response->json('data') as $f) {
            $this->assertEquals(1, $f['availability_status']);
        }
    }

    /**
     * Resolve a real category id. Never hard-code 1: MySQL does not roll back
     * auto-increment counters when a test transaction rolls back, so seeded ids
     * shift between tests.
     */
    private function categoryId(): int
    {
        return (int) EquipmentCategory::query()->value('category_id');
    }

    public function test_create_firearm_as_admin(): void
    {
        $this->actAsAdmin();
        $response = $this->postJson('/api/v1/firearms', [
            'category_id'      => $this->categoryId(),
            'serial_number'    => 'TEST-001',
            'model'            => 'Test Rifle',
            'manufacturer'     => 'Test Mfg',
            'caliber'          => '5.56 NATO',
            'condition_status' => 1,
            'acquisition_date' => '2025-01-01',
            'acquisition_cost' => 50000,
        ]);

        $response->assertStatus(201)
            ->assertJsonFragment(['serial_number' => 'TEST-001']);
    }

    public function test_create_firearm_as_personnel_forbidden(): void
    {
        $this->actAsPersonnel();
        $response = $this->postJson('/api/v1/firearms', [
            'category_id'      => $this->categoryId(),
            'serial_number'    => 'TEST-002',
            'model'            => 'Test',
            'manufacturer'     => 'Test',
            'condition_status' => 1,
            'acquisition_date' => '2025-01-01',
            'acquisition_cost' => 10000,
        ]);

        $response->assertStatus(403);
    }

    public function test_show_firearm(): void
    {
        $this->actAsAdmin();
        $firearm = FirearmEquipment::first();
        $response = $this->getJson("/api/v1/firearms/{$firearm->equipment_id}");

        $response->assertOk()
            ->assertJsonFragment(['serial_number' => $firearm->serial_number]);
    }

    public function test_qr_code_generation(): void
    {
        $this->actAsAdmin();
        $firearm = FirearmEquipment::first();
        $response = $this->get("/api/v1/firearms/{$firearm->equipment_id}/qr");

        $response->assertOk()
            ->assertHeader('Content-Type', 'image/svg+xml');
    }

    public function test_qr_lookup(): void
    {
        $this->actAsAdmin();
        $firearm = FirearmEquipment::first();
        $payload = json_encode($firearm->qrPayload());

        $response = $this->postJson('/api/v1/firearms/lookup', ['qr_payload' => $payload]);

        $response->assertOk()
            ->assertJsonFragment(['serial_number' => $firearm->serial_number]);
    }

    public function test_raw_serial_lookup(): void
    {
        $this->actAsAdmin();
        $firearm = FirearmEquipment::first();

        // Plain raw serial number string (barcode wedge / manual entry)
        $response = $this->postJson('/api/v1/firearms/lookup', ['qr_payload' => $firearm->serial_number]);

        $response->assertOk()
            ->assertJsonFragment(['serial_number' => $firearm->serial_number]);
    }

    public function test_categories_endpoint(): void
    {
        $this->actAsAdmin();
        $response = $this->getJson('/api/v1/categories');

        $response->assertOk();
        $this->assertGreaterThanOrEqual(3, count($response->json()));
    }

    public function test_cannot_delete_checked_out_firearm(): void
    {
        $this->actAsAdmin();
        $firearm = FirearmEquipment::first();
        $firearm->update(['availability_status' => FirearmEquipment::STATUS_CHECKED_OUT]);

        $response = $this->deleteJson("/api/v1/firearms/{$firearm->equipment_id}");
        $response->assertStatus(422);
    }

    public function test_personnel_firearm_reads_are_limited_to_current_assignments(): void
    {
        $personnel = User::where('username', 'pvt.dela.cruz')->firstOrFail();
        $otherPersonnel = User::where('username', 'cpl.santos')->firstOrFail();
        $authorizer = User::where('username', 'armory.custodian')->firstOrFail();
        $firearms = FirearmEquipment::where('availability_status', FirearmEquipment::STATUS_AVAILABLE)
            ->limit(2)
            ->get();
        $ownFirearm = $firearms[0];
        $otherFirearm = $firearms[1];

        Transaction::create([
            'equipment_id' => $ownFirearm->equipment_id,
            'user_id' => $personnel->user_id,
            'authorized_by' => $authorizer->user_id,
            'checkout_at' => now(),
            'expected_return_at' => now()->addHours(4),
            'purpose' => Transaction::PURPOSE_OPERATION,
            'status' => Transaction::STATUS_OVERDUE,
            'condition_on_issue' => FirearmEquipment::CONDITION_GOOD,
            'gps_tracking_enabled' => true,
        ]);
        Transaction::create([
            'equipment_id' => $otherFirearm->equipment_id,
            'user_id' => $otherPersonnel->user_id,
            'authorized_by' => $authorizer->user_id,
            'checkout_at' => now(),
            'expected_return_at' => now()->addHours(4),
            'purpose' => Transaction::PURPOSE_OPERATION,
            'status' => Transaction::STATUS_ACTIVE,
            'condition_on_issue' => FirearmEquipment::CONDITION_GOOD,
            'gps_tracking_enabled' => true,
        ]);
        $ownFirearm->update(['availability_status' => FirearmEquipment::STATUS_OVERDUE]);
        $otherFirearm->update(['availability_status' => FirearmEquipment::STATUS_CHECKED_OUT]);

        Sanctum::actingAs($personnel, [Role::PERSONNEL]);

        $list = $this->getJson('/api/v1/firearms')->assertOk();
        $ids = collect($list->json('data'))->pluck('equipment_id');
        $this->assertTrue($ids->contains($ownFirearm->equipment_id));
        $this->assertFalse($ids->contains($otherFirearm->equipment_id));

        $this->getJson("/api/v1/firearms/{$ownFirearm->equipment_id}")
            ->assertOk()
            ->assertJsonMissingPath('transactions');
        $this->getJson("/api/v1/firearms/{$otherFirearm->equipment_id}")->assertNotFound();
        $this->get("/api/v1/firearms/{$otherFirearm->equipment_id}/qr")->assertNotFound();
        $this->postJson('/api/v1/firearms/lookup', [
            'qr_payload' => json_encode($otherFirearm->qrPayload()),
        ])->assertNotFound();
    }
}
