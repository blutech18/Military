<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('firearm_equipment', function (Blueprint $table) {
            $table->id('equipment_id');
            $table->unsignedBigInteger('category_id');

            $table->string('qr_code', 100)->unique();
            $table->string('serial_number', 50)->unique();
            $table->string('model', 50);
            $table->string('manufacturer', 50);
            $table->string('caliber', 30)->nullable();

            $table->tinyInteger('condition_status')->default(2)
                ->comment('1=Excellent, 2=Good, 3=Fair, 4=Poor');

            $table->unsignedBigInteger('current_location_id')->nullable();

            $table->tinyInteger('availability_status')->default(1)
                ->comment('1=Available, 2=Checked Out, 3=Maintenance, 4=Overdue');

            $table->date('acquisition_date');
            $table->decimal('acquisition_cost', 10, 2);
            $table->date('next_maintenance_due')->nullable();
            $table->text('remarks')->nullable();

            $table->timestamps();
            $table->softDeletes();

            $table->foreign('category_id')->references('category_id')->on('equipment_categories')
                ->onUpdate('cascade')->onDelete('restrict');
            $table->foreign('current_location_id')->references('location_id')->on('gps_locations')
                ->onUpdate('cascade')->onDelete('set null');

            $table->index(['availability_status', 'condition_status']);
            $table->index('category_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('firearm_equipment');
    }
};
