<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id('log_id');
            $table->unsignedBigInteger('user_id')->nullable();
            $table->unsignedBigInteger('equipment_id')->nullable();

            $table->string('action', 50)
                ->comment('login | logout | failed_login | issuance | return | maintenance | gps_update | access_denied | config_change | user_create | user_update | role_change');

            $table->string('description', 500);
            $table->string('role', 30)->nullable();
            $table->string('ip_address', 45);
            $table->string('user_agent', 500)->nullable();

            $table->json('metadata')->nullable();

            $table->timestamp('created_at')->useCurrent();

            $table->foreign('user_id')->references('user_id')->on('users')
                ->onUpdate('cascade')->onDelete('set null');
            $table->foreign('equipment_id')->references('equipment_id')->on('firearm_equipment')
                ->onUpdate('cascade')->onDelete('set null');

            $table->index(['action', 'created_at']);
            $table->index('user_id');
            $table->index('equipment_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_logs');
    }
};
