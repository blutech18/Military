<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('gps_locations', function (Blueprint $table) {
            $table->id('location_id');
            $table->string('location_name', 100);
            $table->string('description', 255)->nullable();
            $table->tinyInteger('security_level')->default(1)
                ->comment('1=Standard, 2=Restricted');

            $table->decimal('center_latitude', 10, 7)->nullable();
            $table->decimal('center_longitude', 10, 7)->nullable();
            $table->decimal('radius_meters', 10, 2)->nullable()
                ->comment('Geofence radius in meters');
            $table->json('polygon')->nullable()
                ->comment('Optional polygon geofence');

            $table->boolean('is_armory')->default(false);
            $table->timestamps();

            $table->index(['security_level', 'is_armory']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gps_locations');
    }
};
