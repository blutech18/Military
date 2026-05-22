<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gps_logs', function (Blueprint $table) {
            $table->id('gps_log_id');
            $table->unsignedBigInteger('transaction_id')->nullable();
            $table->unsignedBigInteger('equipment_id');

            $table->timestamp('captured_at')->useCurrent();
            $table->timestamp('received_at')->useCurrent();

            $table->decimal('latitude', 10, 7);
            $table->decimal('longitude', 10, 7);

            $table->decimal('accuracy_meters', 8, 2)->nullable();
            $table->decimal('speed_mps', 8, 2)->nullable();
            $table->decimal('heading_deg', 6, 2)->nullable();
            $table->decimal('altitude_meters', 8, 2)->nullable();
            $table->unsignedTinyInteger('satellites')->nullable();
            $table->unsignedSmallInteger('battery_pct')->nullable();
            $table->boolean('is_inside_geofence')->nullable();

            $table->string('device_id', 64)->nullable();
            $table->string('signature', 128)->nullable()
                ->comment('HMAC-SHA256 from ESP32');

            $table->foreign('transaction_id')->references('transaction_id')->on('transactions')
                ->onUpdate('cascade')->onDelete('set null');
            $table->foreign('equipment_id')->references('equipment_id')->on('firearm_equipment')
                ->onUpdate('cascade')->onDelete('cascade');

            $table->index(['equipment_id', 'captured_at']);
            $table->index('transaction_id');
            $table->index('captured_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gps_logs');
    }
};
