<?php

namespace App\Console\Commands;

use App\Models\FirearmEquipment;
use App\Models\Notification;
use App\Models\Transaction;
use App\Services\AuditLogger;
use Illuminate\Console\Command;

class SweepOverdueCommand extends Command
{
    protected $signature   = 'armory:sweep-overdue';
    protected $description = 'Mark active transactions as Overdue when expected_return_at has passed.';

    public function handle(): int
    {
        $count = 0;
        Transaction::with('firearm')
            ->where('status', Transaction::STATUS_ACTIVE)
            ->where('expected_return_at', '<', now())
            ->chunkById(100, function ($transactions) use (&$count) {
                foreach ($transactions as $tx) {
                    $tx->update(['status' => Transaction::STATUS_OVERDUE]);
                    $tx->firearm?->update(['availability_status' => FirearmEquipment::STATUS_OVERDUE]);

                    Notification::create([
                        'user_id'      => $tx->authorized_by,
                        'equipment_id' => $tx->equipment_id,
                        'type'         => 'overdue_return',
                        'severity'     => Notification::SEVERITY_WARNING,
                        'title'        => 'Firearm Overdue',
                        'message'      => "Firearm {$tx->firearm?->serial_number} is overdue.",
                        'payload'      => ['transaction_id' => $tx->transaction_id],
                    ]);

                    AuditLogger::log(
                        action: 'overdue_flagged',
                        description: "Transaction {$tx->transaction_id} flagged overdue",
                        equipmentId: $tx->equipment_id,
                    );

                    $count++;
                }
            }, 'transaction_id');

        $this->info("Flagged {$count} transactions as overdue.");
        return self::SUCCESS;
    }
}
