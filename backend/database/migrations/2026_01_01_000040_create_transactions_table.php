<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('transactions', function (Blueprint $table) {
            $table->id('transaction_id');
            $table->unsignedBigInteger('equipment_id');
            $table->unsignedBigInteger('user_id')
                ->comment('Personnel issued to');
            $table->unsignedBigInteger('authorized_by')
                ->comment('S4 / Custodian who approved');

            $table->timestamp('checkout_at')->useCurrent();
            $table->timestamp('expected_return_at')->nullable();
            $table->timestamp('actual_return_at')->nullable();

            $table->tinyInteger('purpose')->default(1)
                ->comment('1=Training, 2=Operation, 3=Maintenance, 4=Inspection');

            $table->string('status', 15)->default('Active')
                ->comment('Active | Returned | Overdue | Cancelled');

            $table->tinyInteger('condition_on_issue')->nullable();
            $table->tinyInteger('condition_on_return')->nullable();

            $table->text('notes')->nullable();
            $table->boolean('gps_tracking_enabled')->default(true);

            $table->timestamps();

            $table->foreign('equipment_id')->references('equipment_id')->on('firearm_equipment')
                ->onUpdate('cascade')->onDelete('restrict');
            $table->foreign('user_id')->references('user_id')->on('users')
                ->onUpdate('cascade')->onDelete('restrict');
            $table->foreign('authorized_by')->references('user_id')->on('users')
                ->onUpdate('cascade')->onDelete('restrict');

            $table->index(['status', 'expected_return_at']);
            $table->index('user_id');
            $table->index('equipment_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('transactions');
    }
};
