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
            'condition_before'  => ['required', 'integer', 'between:0,100'],
            'condition_after'   => ['required', 'integer', 'between:0,100'],
            'maintenance_type'  => ['required', 'string', 'max:30'],
            'cost'              => ['nullable', 'numeric', 'min:0'],
            'parts_replaced'    => ['nullable', 'array'],
            'remarks'           => ['nullable', 'string', 'max:500'],
        ]);

        return DB::transaction(function () use ($request, $data) {
            $record = MaintenanceRecord::create([
                ...$data,
                'performed_by' => $request->user()->user_id,
            ]);

            // Update firearm condition + scheduled maintenance + status when applicable
            $firearm = FirearmEquipment::find($data['equipment_id']);
            if ($firearm) {
                $newCondition = match (true) {
                    $data['condition_after'] >= 90 => FirearmEquipment::CONDITION_EXCELLENT,
                    $data['condition_after'] >= 75 => FirearmEquipment::CONDITION_GOOD,
                    $data['condition_after'] >= 50 => FirearmEquipment::CONDITION_FAIR,
                    default                        => FirearmEquipment::CONDITION_POOR,
                };
                $firearm->update([
                    'condition_status'    => $newCondition,
                    'next_maintenance_due'=> $data['next_schedule'] ?? null,
                    'availability_status' => FirearmEquipment::STATUS_AVAILABLE,
                ]);
            }

            AuditLogger::log(
                action: 'maintenance',
                description: "Maintenance ({$data['maintenance_type']}) on equipment {$data['equipment_id']}",
                user: $request->user(),
                equipmentId: $data['equipment_id'],
                request: $request,
                metadata: ['maintenance_id' => $record->maintenance_id],
            );

            return response()->json($record->fresh(['firearm', 'technician']), 201);
        });
    }
}
