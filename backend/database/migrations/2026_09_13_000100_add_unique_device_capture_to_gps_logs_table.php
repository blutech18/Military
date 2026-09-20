<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        $duplicate = DB::table('gps_logs')
            ->select(['device_id', 'captured_at'])
            ->whereNotNull('device_id')
            ->groupBy('device_id', 'captured_at')
            ->havingRaw('COUNT(*) > 1')
            ->first();

        if ($duplicate) {
            throw new RuntimeException(
                'Cannot add GPS replay protection: duplicate device_id/captured_at rows exist. '
                . 'Back up the database and reconcile those telemetry rows before rerunning the migration.'
            );
        }

        Schema::table('gps_logs', function (Blueprint $table) {
            $table->unique(['device_id', 'captured_at'], 'gps_logs_device_captured_unique');
        });
    }

    public function down(): void
    {
        Schema::table('gps_logs', function (Blueprint $table) {
            $table->dropUnique('gps_logs_device_captured_unique');
        });
    }
};
