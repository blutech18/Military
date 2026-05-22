<?php

namespace App\Http\Controllers;

use App\Models\FirearmEquipment;
use App\Models\Notification;
use App\Models\Transaction;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TransactionController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = Transaction::with(['firearm.category', 'user', 'authorizer'])
            ->when($request->filled('status'), fn($qq) => $qq->where('status', $request->string('status')))
            ->when($request->filled('user_id'), fn($qq) => $qq->where('user_id', $request->integer('user_id')))
            ->when($request->filled('equipment_id'), fn($qq) => $qq->where('equipment_id', $request->integer('equipment_id')))
            ->latest('checkout_at');

        return response()->json($q->paginate($request->integer('per_page', 15)));
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(Transaction::with(['firearm.category', 'user', 'authorizer', 'gpsLogs'])->findOrFail($id));
    }

    /**
     * ISSUANCE WORKFLOW (server side).
     * Caller (S4 Officer / Armory Custodian) authorizes; the personnel must already be authenticated separately.
     */
    public function issue(Request $request): JsonResponse
    {
        $data = $request->validate([
            'equipment_id'      => ['required', 'exists:firearm_equipment,equipment_id'],
            'user_id'           => ['required', 'exists:users,user_id'],
            'expected_return_at'=> ['required', 'date', 'after:now'],
            'purpose'           => ['required', 'integer', 'between:1,4'],
            'condition_on_issue'=> ['required', 'integer', 'between:1,4'],
            'notes'             => ['nullable', 'string', 'max:500'],
            'gps_tracking_enabled' => ['sometimes', 'boolean'],
        ]);

        $authorizer = $request->user();

        return DB::transaction(function () use ($data, $authorizer, $request) {
            $firearm = FirearmEquipment::lockForUpdate()->findOrFail($data['equipment_id']);

            if ($firearm->availability_status !== FirearmEquipment::STATUS_AVAILABLE) {
                return response()->json([
                    'message' => 'Firearm is not available for issuance.',
                    'current_status' => $firearm->availability_label,
                ], 409);
            }

            $issuee = User::findOrFail($data['user_id']);
            if ((int) $issuee->status !== User::STATUS_ACTIVE) {
                return response()->json(['message' => 'Recipient personnel is inactive.'], 422);
            }

            $tx = Transaction::create([
                'equipment_id'         => $firearm->equipment_id,
                'user_id'              => $issuee->user_id,
                'authorized_by'        => $authorizer->user_id,
                'checkout_at'          => now(),
                'expected_return_at'   => $data['expected_return_at'],
                'purpose'              => $data['purpose'],
                'status'               => Transaction::STATUS_ACTIVE,
                'condition_on_issue'   => $data['condition_on_issue'],
                'notes'                => $data['notes'] ?? null,
                'gps_tracking_enabled' => $data['gps_tracking_enabled'] ?? true,
            ]);

            $firearm->update(['availability_status' => FirearmEquipment::STATUS_CHECKED_OUT]);

            AuditLogger::log(
                action: 'issuance',
                description: "Issued {$firearm->serial_number} to {$issuee->fullName()}",
                user: $authorizer,
                equipmentId: $firearm->equipment_id,
                request: $request,
                metadata: ['transaction_id' => $tx->transaction_id, 'recipient_id' => $issuee->user_id],
            );

            return response()->json($tx->fresh(['firearm', 'user', 'authorizer']), 201);
        });
    }

    public function returnFirearm(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'condition_on_return' => ['required', 'integer', 'between:1,4'],
            'notes'               => ['nullable', 'string', 'max:500'],
        ]);

        return DB::transaction(function () use ($id, $data, $request) {
            $tx = Transaction::with('firearm')->lockForUpdate()->findOrFail($id);

            if ($tx->status !== Transaction::STATUS_ACTIVE && $tx->status !== Transaction::STATUS_OVERDUE) {
                return response()->json(['message' => 'Transaction is not active.'], 409);
            }

            $tx->update([
                'actual_return_at'    => now(),
                'condition_on_return' => $data['condition_on_return'],
                'status'              => Transaction::STATUS_RETURNED,
                'gps_tracking_enabled'=> false,
                'notes'               => trim(($tx->notes ? $tx->notes."\n" : '') . ($data['notes'] ?? '')),
            ]);

            $newStatus = (int) $data['condition_on_return'] >= FirearmEquipment::CONDITION_FAIR
                ? FirearmEquipment::STATUS_MAINTENANCE
                : FirearmEquipment::STATUS_AVAILABLE;

            $tx->firearm->update([
                'availability_status' => $newStatus,
                'condition_status'    => $data['condition_on_return'],
            ]);

            AuditLogger::log(
                action: 'return',
                description: "Returned {$tx->firearm->serial_number} (condition {$data['condition_on_return']})",
                user: $request->user(),
                equipmentId: $tx->equipment_id,
                request: $request,
                metadata: ['transaction_id' => $tx->transaction_id],
            );

            return response()->json($tx->fresh(['firearm', 'user', 'authorizer']));
        });
    }

    /**
     * Mark overdue transactions and emit notifications. Intended to be called by a scheduled job.
     */
    public function sweepOverdue(Request $request): JsonResponse
    {
        $now = now();
        $overdue = Transaction::where('status', Transaction::STATUS_ACTIVE)
            ->where('expected_return_at', '<', $now)
            ->get();

        foreach ($overdue as $tx) {
            $tx->update(['status' => Transaction::STATUS_OVERDUE]);
            $tx->firearm?->update(['availability_status' => FirearmEquipment::STATUS_OVERDUE]);

            Notification::create([
                'user_id'      => $tx->authorized_by,
                'equipment_id' => $tx->equipment_id,
                'type'         => 'overdue_return',
                'severity'     => Notification::SEVERITY_WARNING,
                'title'        => 'Firearm Overdue',
                'message'      => "Firearm {$tx->firearm?->serial_number} is overdue for return.",
                'payload'      => ['transaction_id' => $tx->transaction_id],
            ]);

            AuditLogger::log(
                action: 'overdue_flagged',
                description: "Transaction {$tx->transaction_id} flagged overdue",
                user: $request->user(),
                equipmentId: $tx->equipment_id,
                request: $request,
            );
        }

        return response()->json(['flagged' => $overdue->count()]);
    }
}
