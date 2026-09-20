<?php

namespace Tests\Feature;

use App\Models\FirearmEquipment;
use App\Models\GpsLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use RuntimeException;
use Tests\TestCase;

class GpsMigrationTest extends TestCase
{
    use RefreshDatabase;

    public function test_replay_index_migration_fails_safely_when_historical_duplicates_exist(): void
    {
        $this->seed();
        $firearm = FirearmEquipment::firstOrFail();
        $capturedAt = now()->startOfSecond();

        Schema::table('gps_logs', function ($table) {
            $table->dropUnique('gps_logs_device_captured_unique');
        });

        foreach ([8.48, 8.49] as $latitude) {
            GpsLog::create([
                'equipment_id' => $firearm->equipment_id,
                'captured_at' => $capturedAt,
                'received_at' => now(),
                'latitude' => $latitude,
                'longitude' => 124.65,
                'device_id' => 'DUPLICATE-MIGRATION-TEST',
            ]);
        }

        $migration = require database_path('migrations/2026_09_13_000100_add_unique_device_capture_to_gps_logs_table.php');
        $thrown = false;

        try {
            $migration->up();
        } catch (RuntimeException $exception) {
            $thrown = true;
            $this->assertStringContainsString('Back up the database and reconcile', $exception->getMessage());
        } finally {
            GpsLog::where('device_id', 'DUPLICATE-MIGRATION-TEST')->delete();
            $migration->up();
        }

        $this->assertTrue($thrown, 'The migration must stop before adding a unique index over duplicate telemetry.');
    }
}
