<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->id('notification_id');
            $table->unsignedBigInteger('user_id');
            $table->unsignedBigInteger('equipment_id')->nullable();

            $table->string('type', 50)
                ->comment('overdue_return | unauthorized_access | geofence_violation | maintenance_due | failed_login | suspicious_activity | gps_offline');

            $table->string('severity', 10)->default('info')
                ->comment('info | warning | critical');

            $table->string('title', 100);
            $table->string('message', 500);
            $table->json('payload')->nullable();

            $table->string('status', 10)->default('Unread')
                ->comment('Unread | Read | Acknowledged');
            $table->timestamp('read_at')->nullable();

            $table->timestamps();

            $table->foreign('user_id')->references('user_id')->on('users')
                ->onUpdate('cascade')->onDelete('cascade');
            $table->foreign('equipment_id')->references('equipment_id')->on('firearm_equipment')
                ->onUpdate('cascade')->onDelete('cascade');

            $table->index(['user_id', 'status']);
            $table->index(['type', 'severity']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};
