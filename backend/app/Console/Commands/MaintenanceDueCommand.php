<?php

namespace App\Console\Commands;

use App\Models\FirearmEquipment;
use App\Models\Notification;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Console\Command;

class MaintenanceDueCommand extends Command
{
    protected $signature   = 'armory:maintenance-due';
    protected $description = 'Generate notifications for firearms with upcoming or overdue maintenance schedules.';

    public function handle(): int
    {
        $count = 0;

        // Firearms with maintenance due within the next 3 days or already overdue
        $firearms = FirearmEquipment::whereNotNull('next_maintenance_due')
            ->where('next_maintenance_due', '<=', now()->addDays(3))
            ->where('availability_status', '!=', FirearmEquipment::STATUS_MAINTENANCE)
            ->get();

        // Notify all S4 Officers and Armory Custodians
        $recipients = User::whereHas('role', function ($q) {
            $q->whereIn('role_name', ['Administrator', 'S4 Officer', 'Armory Custodian']);
        })->where('status', User::STATUS_ACTIVE)->pluck('user_id');

        foreach ($firearms as $firearm) {
            $isOverdue = $firearm->next_maintenance_due->isPast();
            $severity = $isOverdue ? Notification::SEVERITY_WARNING : Notification::SEVERITY_INFO;
            $title = $isOverdue ? 'Maintenance Overdue' : 'Maintenance Due Soon';
            $message = $isOverdue
                ? "Firearm {$firearm->serial_number} maintenance was due on {$firearm->next_maintenance_due->format('Y-m-d')}."
                : "Firearm {$firearm->serial_number} maintenance due on {$firearm->next_maintenance_due->format('Y-m-d')}.";

            foreach ($recipients as $userId) {
                // Avoid duplicate notifications for the same firearm on the same day
                $exists = Notification::where('user_id', $userId)
                    ->where('equipment_id', $firearm->equipment_id)
                    ->where('type', 'maintenance_due')
                    ->whereDate('created_at', today())
                    ->exists();

                if (!$exists) {
                    Notification::create([
                        'user_id'      => $userId,
                        'equipment_id' => $firearm->equipment_id,
                        'type'         => 'maintenance_due',
                        'severity'     => $severity,
                        'title'        => $title,
                        'message'      => $message,
                        'payload'      => [
                            'equipment_id' => $firearm->equipment_id,
                            'due_date'     => $firearm->next_maintenance_due->toDateString(),
                        ],
                    ]);
                    $count++;
                }
            }
        }

        $this->info("Generated {$count} maintenance-due notifications.");
        return self::SUCCESS;
    }
}
