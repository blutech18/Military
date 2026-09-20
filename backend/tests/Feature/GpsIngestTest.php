<?php

namespace Tests\Feature;

use App\Models\FirearmEquipment;
use App\Models\GpsLocation;
use App\Models\Notification;
use App\Models\Transaction;
use App\Models\GpsLog;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class GpsIngestTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-iot-hmac-secret';

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
        config([
            'armory.iot.hmac_secret' => self::SECRET,
            'armory.gps.max_age_seconds' => 300,
            'armory.gps.future_tolerance_seconds' => 30,
        ]);
    }

    public function test_ingest_rejects_invalid_signature_and_stale_timestamp(): void
    {
        [$firearm, $transaction] = $this->activeAssignment();
        $payload = $this->payload($firearm, $transaction, now()->subMinutes(10)->toIso8601String());
        $body = json_encode($payload, JSON_THROW_ON_ERROR);

        $this->call('POST', '/api/v1/gps/ingest', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_ARMORY_SIGNATURE' => 'invalid',
        ], $body)->assertUnauthorized();

        $this->signedPost($payload)->assertStatus(422)
            ->assertJson(['message' => 'GPS update is too old.']);
    }

    public function test_ingest_rejects_mismatched_disabled_and_out_of_order_updates(): void
    {
        [$firearm, $transaction] = $this->activeAssignment();
        $otherTransaction = Transaction::where('equipment_id', '!=', $firearm->equipment_id)->firstOrFail();
        $capturedAt = now()->subSecond()->toIso8601String();

        $mismatched = $this->payload($firearm, $transaction, $capturedAt);
        $mismatched['transaction_id'] = $otherTransaction->transaction_id;
        $this->signedPost($mismatched)->assertStatus(409);

        $transaction->update(['gps_tracking_enabled' => false]);
        $this->signedPost($this->payload($firearm, $transaction, $capturedAt))->assertStatus(409)
            ->assertJson(['message' => 'GPS tracking is disabled for this transaction.']);

        $transaction->update(['gps_tracking_enabled' => true]);
        $valid = $this->payload($firearm, $transaction, $capturedAt);
        $this->signedPost($valid)->assertOk();
        $this->signedPost($valid)->assertStatus(409)
            ->assertJson(['message' => 'Duplicate or out-of-order GPS update.']);
    }

    public function test_geofence_alert_is_created_only_on_inside_to_outside_transition(): void
    {
        [$firearm, $transaction] = $this->activeAssignment();
        $armory = GpsLocation::where('is_armory', true)->firstOrFail();
        $baseTime = now()->subSeconds(3);

        $inside = $this->payload($firearm, $transaction, $baseTime->toIso8601String());
        $inside['latitude'] = (float) $armory->center_latitude;
        $inside['longitude'] = (float) $armory->center_longitude;
        $this->signedPost($inside)->assertOk()->assertJson(['inside_geofence' => true]);

        $outside = $this->payload($firearm, $transaction, $baseTime->copy()->addSecond()->toIso8601String());
        $outside['latitude'] = 0;
        $outside['longitude'] = 0;
        $this->signedPost($outside)->assertOk()->assertJson(['inside_geofence' => false]);

        $outside['captured_at'] = $baseTime->copy()->addSeconds(2)->toIso8601String();
        $this->signedPost($outside)->assertOk();

        $alerts = Notification::where('type', 'geofence_violation')
            ->where('equipment_id', $firearm->equipment_id)
            ->get();
        $this->assertCount(1, $alerts);
        $this->assertSame($transaction->authorized_by, $alerts->first()->user_id);
    }

    public function test_utc_timestamps_are_stored_faithfully_and_ordering_is_enforced(): void
    {
        [$firearm, $transaction] = $this->activeAssignment();
        $capturedAt = CarbonImmutable::now()->utc()->startOfSecond()->subSeconds(5);

        /* Devices report UTC with a "Z" suffix rather than a local offset. */
        $accepted = $this->payload($firearm, $transaction, $capturedAt->format('Y-m-d\TH:i:s\Z'));
        $this->signedPost($accepted)->assertOk();

        $stored = GpsLog::where('device_id', $accepted['device_id'])->latest('captured_at')->firstOrFail();
        $this->assertSame(
            $capturedAt->getTimestamp(),
            $stored->captured_at->getTimestamp(),
            'The stored instant must match the UTC instant the device reported.'
        );

        /* An earlier UTC fix must be refused, not silently recorded out of order. */
        $older = $this->payload($firearm, $transaction, $capturedAt->subSeconds(2)->format('Y-m-d\TH:i:s\Z'));
        $this->signedPost($older)->assertStatus(409)
            ->assertJson(['message' => 'Duplicate or out-of-order GPS update.']);
    }

    public function test_initial_outside_point_alerts_once_and_repeated_outside_points_are_suppressed(): void
    {
        [$firearm, $transaction] = $this->activeAssignment();
        $baseTime = now()->subSeconds(2);
        $outside = $this->payload($firearm, $transaction, $baseTime->toIso8601String());
        $outside['latitude'] = 0;
        $outside['longitude'] = 0;

        $this->signedPost($outside)->assertOk()->assertJson(['inside_geofence' => false]);
        $outside['captured_at'] = $baseTime->copy()->addSecond()->toIso8601String();
        $this->signedPost($outside)->assertOk();

        $this->assertSame(1, Notification::where('type', 'geofence_violation')
            ->where('equipment_id', $firearm->equipment_id)
            ->count());
    }

    private function activeAssignment(): array
    {
        $firearm = FirearmEquipment::where('availability_status', FirearmEquipment::STATUS_AVAILABLE)->firstOrFail();
        $personnel = User::where('username', 'pvt.dela.cruz')->firstOrFail();
        $authorizer = User::where('username', 'armory.custodian')->firstOrFail();

        $transaction = Transaction::create([
            'equipment_id' => $firearm->equipment_id,
            'user_id' => $personnel->user_id,
            'authorized_by' => $authorizer->user_id,
            'checkout_at' => now()->subHour(),
            'expected_return_at' => now()->addHours(4),
            'purpose' => Transaction::PURPOSE_OPERATION,
            'status' => Transaction::STATUS_ACTIVE,
            'condition_on_issue' => FirearmEquipment::CONDITION_GOOD,
            'gps_tracking_enabled' => true,
        ]);
        $firearm->update(['availability_status' => FirearmEquipment::STATUS_CHECKED_OUT]);

        return [$firearm->fresh(), $transaction->fresh()];
    }

    private function payload(FirearmEquipment $firearm, Transaction $transaction, string $capturedAt): array
    {
        return [
            'equipment_id' => $firearm->equipment_id,
            'transaction_id' => $transaction->transaction_id,
            'device_id' => 'TEST-GPS-DEVICE-01',
            'captured_at' => $capturedAt,
            'latitude' => 8.485,
            'longitude' => 124.65,
            'accuracy_meters' => 5.2,
            'speed_mps' => 0,
            'satellites' => 8,
            'battery_pct' => 90,
        ];
    }

    private function signedPost(array $payload): TestResponse
    {
        $body = json_encode($payload, JSON_THROW_ON_ERROR);

        return $this->call('POST', '/api/v1/gps/ingest', [], [], [], [
            'CONTENT_TYPE' => 'application/json',
            'HTTP_ACCEPT' => 'application/json',
            'HTTP_X_ARMORY_SIGNATURE' => hash_hmac('sha256', $body, self::SECRET),
        ], $body);
    }
}
