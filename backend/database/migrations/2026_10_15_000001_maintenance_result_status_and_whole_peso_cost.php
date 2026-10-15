<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Client revision: a maintenance record states whether the firearm is fit for use afterwards
 * (Serviceable / Needs Further Repair / Unserviceable) instead of before/after percentages,
 * and cost is recorded in whole pesos.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('maintenance_records', function (Blueprint $table) {
            $table->unsignedTinyInteger('result_status')->nullable()->after('maintenance_type')
                ->comment('1 Serviceable | 2 Needs Further Repair | 3 Unserviceable');
        });

        // Every record before this revision closed with the firearm back in service.
        DB::table('maintenance_records')->whereNull('result_status')->update(['result_status' => 1]);

        DB::table('maintenance_records')->update(['cost' => DB::raw('ROUND(cost)')]);

        Schema::table('maintenance_records', function (Blueprint $table) {
            $table->unsignedTinyInteger('result_status')->default(1)->nullable(false)->change();
            $table->unsignedTinyInteger('condition_before')->nullable()->change();
            $table->unsignedTinyInteger('condition_after')->nullable()->change();
            $table->unsignedInteger('cost')->default(0)->change();
        });
    }

    public function down(): void
    {
        Schema::table('maintenance_records', function (Blueprint $table) {
            $table->decimal('cost', 10, 2)->default(0)->change();
            $table->dropColumn('result_status');
        });
    }
};
