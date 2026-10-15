<?php

namespace App\Http\Controllers;

use App\Models\FirearmEquipment;
use App\Models\MaintenanceRecord;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class MaintenanceController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = MaintenanceRecord::with(['firearm:equipment_id,serial_number,model', 'technician:user_id,first_name,last_name,rank'])
            ->when($request->filled('equipment_id'), fn($qq) => $qq->where('equipment_id', $request->integer('equipment_id')))
            ->latest('maintenance_date');
        return response()->json($q->paginate($request->integer('per_page', 15)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'equipment_id'      => ['required', 'exists:firearm_equipment,equipment_id'],
            'description'       => ['required', 'string', 'max:500'],
            'maintenance_date'  => ['required', 'date'],
            'next_schedule'     => ['nullable', 'date', 'after:maintenance_date'],
            'maintenance_type'  => ['required', 'string', 'in:Inspection,Repair,Cleaning,Calibration'],
            'result_status'     => ['required', 'integer', 'in:' . implode(',', array_keys(MaintenanceRecord::RESULT_LABELS))],
            'cost'              => ['nullable', 'integer', 'min:0'],
            'parts_replaced'    => ['nullable', 'array'],
            'remarks'           => ['nullable', 'string', 'max:500'],
        ]);

        return DB::transaction(function () use ($request, $data) {
            $record = MaintenanceRecord::create([
                ...$data,
                'performed_by' => $request->user()->user_id,
            ]);

            // The result decides whether the firearm can be issued again. A firearm that is
            // still out with someone keeps its checked-out/overdue status.
            $firearm = FirearmEquipment::find($data['equipment_id']);
            if ($firearm) {
                $update = ['next_maintenance_due' => $data['next_schedule'] ?? null];

                $update['condition_status'] = match ((int) $data['result_status']) {
                    MaintenanceRecord::RESULT_SERVICEABLE => min($firearm->condition_status ?: FirearmEquipment::CONDITION_GOOD, FirearmEquipment::CONDITION_GOOD),
                    MaintenanceRecord::RESULT_NEEDS_REPAIR => FirearmEquipment::CONDITION_FAIR,
                    default => FirearmEquipment::CONDITION_POOR,
                };

                $isOut = in_array((int) $firearm->availability_status, [FirearmEquipment::STATUS_CHECKED_OUT, FirearmEquipment::STATUS_OVERDUE], true);
                if (!$isOut) {
                    $update['availability_status'] = (int) $data['result_status'] === MaintenanceRecord::RESULT_SERVICEABLE
                        ? FirearmEquipment::STATUS_AVAILABLE
                        : FirearmEquipment::STATUS_MAINTENANCE;
                }

                $firearm->update($update);
            }

            AuditLogger::log(
                action: 'maintenance',
                description: "Maintenance ({$data['maintenance_type']}) on equipment {$data['equipment_id']}: {$record->resultLabel()}",
                user: $request->user(),
                equipmentId: $data['equipment_id'],
                request: $request,
                metadata: ['maintenance_id' => $record->maintenance_id, 'result_status' => $record->resultLabel()],
            );

            return response()->json($record->fresh(['firearm', 'technician']), 201);
        });
    }
}
