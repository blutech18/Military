<?php

namespace App\Http\Controllers;

use App\Models\FirearmEquipment;
use App\Models\LogisticsRequest;
use App\Models\MaintenanceRecord;
use App\Models\Notification;
use App\Models\Role;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * S4 Officer → Command Officer requests. The S4 asks for new firearms or for the budget to repair
 * the firearms that need it; only the Command Officer approves or rejects.
 */
class LogisticsRequestController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = LogisticsRequest::with(['requester:user_id,rank,first_name,last_name,username', 'decider:user_id,rank,first_name,last_name,username'])
            // An S4 Officer sees their own requests; the Command Officer and Administrator see all.
            ->when($request->user()->hasRole(Role::S4_OFFICER), fn($qq) => $qq->where('requested_by', $request->user()->user_id))
            ->when($request->filled('status'), fn($qq) => $qq->where('status', $request->string('status')))
            ->latest();

        return response()->json($q->paginate($request->integer('per_page', 20)));
    }

    /**
     * Firearms whose latest maintenance says they are not fit for use, with the cost recorded on
     * that job: the starting point of a repair-budget request.
     */
    public function repairSummary(): JsonResponse
    {
        $latestIds = MaintenanceRecord::selectRaw('MAX(maintenance_id) AS id')->groupBy('equipment_id')->pluck('id');

        $items = MaintenanceRecord::with('firearm:equipment_id,serial_number,model')
            ->whereIn('maintenance_id', $latestIds)
            ->whereIn('result_status', [MaintenanceRecord::RESULT_NEEDS_REPAIR, MaintenanceRecord::RESULT_UNSERVICEABLE])
            ->whereHas('firearm')
            ->orderBy('equipment_id')
            ->get()
            ->map(fn($m) => [
                'equipment_id'  => $m->equipment_id,
                'serial_number' => $m->firearm->serial_number,
                'model'         => $m->firearm->model,
                'result'        => $m->resultLabel(),
                'last_job'      => $m->maintenance_type . ': ' . $m->description,
                'date'          => optional($m->maintenance_date)->format('Y-m-d'),
                'cost'          => (int) $m->cost,
            ])->values();

        return response()->json(['items' => $items, 'total_cost' => (int) $items->sum('cost')]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'type'           => ['required', 'in:' . LogisticsRequest::TYPE_NEW_FIREARM . ',' . LogisticsRequest::TYPE_REPAIR_BUDGET],
            'title'          => ['required', 'string', 'max:150'],
            'details'        => ['nullable', 'string', 'max:2000'],
            'quantity'       => ['nullable', 'required_if:type,' . LogisticsRequest::TYPE_NEW_FIREARM, 'integer', 'min:1', 'max:10000'],
            'estimated_cost' => ['required', 'integer', 'min:0'],
            'items'          => ['nullable', 'array', 'max:500'],
            'items.*.equipment_id' => ['required_with:items', 'integer', 'distinct', 'exists:firearm_equipment,equipment_id'],
            'items.*.cost'         => ['required_with:items', 'integer', 'min:0'],
        ]);

        if ($data['type'] === LogisticsRequest::TYPE_REPAIR_BUDGET && ! empty($data['items'])) {
            // Store serials with the ids so the request still reads correctly if a firearm is archived later.
            $serials = FirearmEquipment::whereIn('equipment_id', array_column($data['items'], 'equipment_id'))
                ->pluck('serial_number', 'equipment_id');
            $data['items'] = array_map(fn($i) => [
                'equipment_id'  => (int) $i['equipment_id'],
                'serial_number' => $serials[$i['equipment_id']] ?? null,
                'cost'          => (int) $i['cost'],
            ], $data['items']);
            // The budget asked for is exactly the sum of the per-firearm repair costs.
            $data['estimated_cost'] = array_sum(array_column($data['items'], 'cost'));
        } else {
            $data['items'] = null;
        }
        if ($data['type'] !== LogisticsRequest::TYPE_NEW_FIREARM) {
            $data['quantity'] = null;
        }

        return DB::transaction(function () use ($request, $data) {
            $req = LogisticsRequest::create($data + [
                'status'       => LogisticsRequest::STATUS_PENDING,
                'requested_by' => $request->user()->user_id,
            ]);

            AuditLogger::log('request_submitted', "{$req->typeLabel()} request #{$req->request_id}: {$req->title}", $request->user(), request: $request,
                metadata: ['created' => $req->only(['request_id', 'type', 'title', 'quantity', 'estimated_cost'])]);

            Notification::notifyRoles([
                'type'     => 'request_submitted',
                'severity' => Notification::SEVERITY_INFO,
                'title'    => "{$req->typeLabel()} Request",
                'message'  => sprintf('%s requests: %s (PHP %s). Waiting for your approval.',
                    $request->user()->fullName(), $req->title, number_format($req->estimated_cost)),
                'payload'  => ['request_id' => $req->request_id],
            ], [Role::COMMAND_OFFICER]);

            return response()->json($req->fresh(['requester', 'decider']), 201);
        });
    }

    public function decide(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'decision' => ['required', 'in:' . LogisticsRequest::STATUS_APPROVED . ',' . LogisticsRequest::STATUS_REJECTED],
            'note'     => ['nullable', 'string', 'max:500'],
        ]);

        return DB::transaction(function () use ($request, $id, $data) {
            $req = LogisticsRequest::lockForUpdate()->findOrFail($id);
            if ($req->status !== LogisticsRequest::STATUS_PENDING) {
                return response()->json(['message' => "This request was already {$req->status}."], 422);
            }

            $req->update([
                'status'        => $data['decision'],
                'decided_by'    => $request->user()->user_id,
                'decided_at'    => now(),
                'decision_note' => $data['note'] ?? null,
            ]);

            AuditLogger::log("request_{$data['decision']}", ucfirst($data['decision']) . " {$req->typeLabel()} request #{$req->request_id}: {$req->title}",
                $request->user(), request: $request,
                metadata: ['request_id' => $req->request_id, 'changes' => ['status' => ['from' => 'pending', 'to' => $data['decision']]], 'note' => $data['note'] ?? null]);

            Notification::create([
                'user_id'  => $req->requested_by,
                'type'     => "request_{$data['decision']}",
                'severity' => $data['decision'] === LogisticsRequest::STATUS_APPROVED ? Notification::SEVERITY_INFO : Notification::SEVERITY_WARNING,
                'title'    => 'Request ' . ucfirst($data['decision']),
                'message'  => "{$request->user()->fullName()} {$data['decision']} your request \"{$req->title}\"."
                    . (! empty($data['note']) ? " Note: {$data['note']}" : ''),
                'payload'  => ['request_id' => $req->request_id],
            ]);

            return response()->json($req->fresh(['requester', 'decider']));
        });
    }
}
