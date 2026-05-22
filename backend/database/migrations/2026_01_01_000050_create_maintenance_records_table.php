<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('maintenance_records', function (Blueprint $table) {
            $table->id('maintenance_id');
            $table->unsignedBigInteger('equipment_id');
            $table->unsignedBigInteger('performed_by');

            $table->string('description', 500);
            $table->timestamp('maintenance_date')->useCurrent();
            $table->timestamp('next_schedule')->nullable();

            $table->unsignedTinyInteger('condition_before')
                ->comment('Score 0-100 %');
            $table->unsignedTinyInteger('condition_after')
                ->comment('Score 0-100 %');

            $table->string('maintenance_type', 30)
                ->comment('Inspection | Repair | Cleaning | Calibration');

            $table->decimal('cost', 10, 2)->default(0);
            $table->json('parts_replaced')->nullable();
            $table->text('remarks')->nullable();

            $table->timestamps();

            $table->foreign('equipment_id')->references('equipment_id')->on('firearm_equipment')
                ->onUpdate('cascade')->onDelete('cascade');
            $table->foreign('performed_by')->references('user_id')->on('users')
                ->onUpdate('cascade')->onDelete('restrict');

            $table->index('equipment_id');
            $table->index('maintenance_date');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('maintenance_records');
    }
};
