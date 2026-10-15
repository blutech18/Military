<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Client revision: the S4 Officer requests new firearms, and the budget to repair the firearms
 * that need it, from the Command Officer, who approves or rejects.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('logistics_requests', function (Blueprint $table) {
            $table->id('request_id');
            $table->string('type', 20)->comment('new_firearm | repair_budget');
            $table->string('title', 150);
            $table->text('details')->nullable();
            $table->unsignedInteger('quantity')->nullable()->comment('new_firearm: how many');
            $table->unsignedInteger('estimated_cost')->default(0)->comment('Whole pesos');
            $table->json('items')->nullable()->comment('repair_budget: firearms to repair with their cost');
            $table->string('status', 10)->default('pending')->comment('pending | approved | rejected');

            $table->unsignedBigInteger('requested_by');
            $table->unsignedBigInteger('decided_by')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->string('decision_note', 500)->nullable();
            $table->timestamps();

            $table->foreign('requested_by')->references('user_id')->on('users')->onUpdate('cascade')->onDelete('restrict');
            $table->foreign('decided_by')->references('user_id')->on('users')->onUpdate('cascade')->onDelete('restrict');
            $table->index(['status', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('logistics_requests');
    }
};
