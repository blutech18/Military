<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('equipment_categories', function (Blueprint $table) {
            $table->id('category_id');
            $table->tinyInteger('category_code')
                ->comment('1=Firearm, 2=Ammunition, 3=Tactical Gear');
            $table->string('category_name', 50);
            $table->string('description', 255);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_categories');
    }
};
