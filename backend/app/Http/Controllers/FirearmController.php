<?php

namespace App\Http\Controllers;

use App\Models\FirearmEquipment;
use App\Models\Role;
use App\Models\Transaction;
use App\Services\AuditLogger;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Str;

class FirearmController extends Controller
{
    public function categories(): JsonResponse
    {
        return response()->json(\App\Models\EquipmentCategory::all());
    }

    public function index(Request $request): JsonResponse
    {
        $isPersonnel = $request->user()->hasRole(Role::PERSONNEL);
        $userId = $request->user()->user_id;
        $currentStatuses = [Transaction::STATUS_ACTIVE, Transaction::STATUS_OVERDUE];

        $q = FirearmEquipment::with(['category', 'currentLocation'])
            ->when($isPersonnel, fn($query) => $query->whereHas('transactions', fn($transaction) =>
                $transaction->where('user_id', $userId)->whereIn('status', $currentStatuses)
            ))
            ->when($request->string('search')->trim()->value(), function ($query, $search) {
                $query->where(function ($w) use ($search) {
                    $w->where('serial_number', 'like', "%{$search}%")
                      ->orWhere('model', 'like', "%{$search}%")
                      ->orWhere('manufacturer', 'like', "%{$search}%")
                      ->orWhere('qr_code', 'like', "%{$search}%");
                });
            })
            ->when($request->filled('availability_status'), fn($q2) =>
                $q2->where('availability_status', $request->integer('availability_status')))
            ->when($request->filled('condition_status'), fn($q2) =>
                $q2->where('condition_status', $request->integer('condition_status')))
            ->latest('updated_at');

        return response()->json($q->paginate($request->integer('per_page', 15)));
    }

    public function show(Request $request, int $id): JsonResponse
    {
        $isPersonnel = $request->user()->hasRole(Role::PERSONNEL);
        $userId = $request->user()->user_id;
        $currentStatuses = [Transaction::STATUS_ACTIVE, Transaction::STATUS_OVERDUE];
        $relations = ['category', 'currentLocation'];
        if (! $isPersonnel) {
            $relations[] = 'transactions.user';
        }

        $firearm = FirearmEquipment::with($relations)
            ->when($isPersonnel, fn($query) => $query->whereHas('transactions', fn($transaction) =>
                $transaction->where('user_id', $userId)->whereIn('status', $currentStatuses)
            ))
            ->findOrFail($id);

        return response()->json($firearm);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'category_id'       => ['required', 'exists:equipment_categories,category_id'],
            'serial_number'     => ['required', 'string', 'max:50', 'unique:firearm_equipment,serial_number'],
            'model'             => ['required', 'string', 'max:50'],
            'manufacturer'      => ['required', 'string', 'max:50'],
            'caliber'           => ['nullable', 'string', 'max:30'],
            'condition_status'  => ['required', 'integer', 'between:1,4'],
            'current_location_id' => ['nullable', 'exists:gps_locations,location_id'],
            'acquisition_date'  => ['required', 'date'],
            'acquisition_cost'  => ['required', 'numeric', 'min:0'],
            'remarks'           => ['nullable', 'string', 'max:500'],
        ]);

        $data['qr_code']             = 'ARMORY-' . Str::upper(Str::random(10)) . '-' . $data['serial_number'];
        $data['availability_status'] = FirearmEquipment::STATUS_AVAILABLE;

        $firearm = FirearmEquipment::create($data);

        AuditLogger::log(
            action: 'firearm_register',
            description: "Registered firearm {$firearm->serial_number} ({$firearm->model})",
            user: $request->user(),
            equipmentId: $firearm->equipment_id,
            request: $request,
        );

        return response()->json($firearm->fresh(['category', 'currentLocation']), 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $firearm = FirearmEquipment::findOrFail($id);

        $data = $request->validate([
            'category_id'         => ['sometimes', 'exists:equipment_categories,category_id'],
            'model'               => ['sometimes', 'string', 'max:50'],
            'manufacturer'        => ['sometimes', 'string', 'max:50'],
            'caliber'             => ['sometimes', 'nullable', 'string', 'max:30'],
            'condition_status'    => ['sometimes', 'integer', 'between:1,4'],
            'availability_status' => ['sometimes', 'integer', 'between:1,4'],
            'current_location_id' => ['sometimes', 'nullable', 'exists:gps_locations,location_id'],
            'next_maintenance_due'=> ['sometimes', 'nullable', 'date'],
            'remarks'             => ['sometimes', 'nullable', 'string', 'max:500'],
        ]);

        $firearm->update($data);

        AuditLogger::log(
            action: 'firearm_update',
            description: "Updated firearm {$firearm->serial_number}",
            user: $request->user(),
            equipmentId: $firearm->equipment_id,
            request: $request,
            metadata: ['changes' => $data],
        );

        return response()->json($firearm->fresh(['category', 'currentLocation']));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $firearm = FirearmEquipment::findOrFail($id);

        if ($firearm->availability_status === FirearmEquipment::STATUS_CHECKED_OUT) {
            return response()->json(['message' => 'Cannot delete a checked-out firearm.'], 422);
        }

        $firearm->delete();

        AuditLogger::log(
            action: 'firearm_delete',
            description: "Soft-deleted firearm {$firearm->serial_number}",
            user: $request->user(),
            equipmentId: $firearm->equipment_id,
            request: $request,
        );

        return response()->json(['message' => 'Firearm archived.']);
    }

    /**
     * Returns an SVG QR code for the firearm. Encodes the JSON QR payload.
     */
    public function qrCode(Request $request, int $id): Response
    {
        $isPersonnel = $request->user()->hasRole(Role::PERSONNEL);
        $userId = $request->user()->user_id;
        $currentStatuses = [Transaction::STATUS_ACTIVE, Transaction::STATUS_OVERDUE];

        $firearm = FirearmEquipment::with('category')
            ->when($isPersonnel, fn($query) => $query->whereHas('transactions', fn($transaction) =>
                $transaction->where('user_id', $userId)->whereIn('status', $currentStatuses)
            ))
            ->findOrFail($id);

        $payload = json_encode($firearm->qrPayload(), JSON_UNESCAPED_SLASHES);

        $renderer = new ImageRenderer(
            new RendererStyle(280),
            new SvgImageBackEnd()
        );
        $writer = new Writer($renderer);
        $svg    = $writer->writeString($payload);

        return response($svg, 200, [
            'Content-Type'        => 'image/svg+xml',
            'Cache-Control'       => 'no-store, max-age=0',
            'Content-Disposition' => 'inline; filename="firearm-' . $firearm->serial_number . '.svg"',
        ]);
    }

    /**
     * Lookup a firearm by scanned QR string. Browser scanner posts the decoded text here.
     */
    public function lookup(Request $request): JsonResponse
    {
        $data = $request->validate([
            'qr_payload' => ['required', 'string', 'max:2048'],
        ]);

        $raw = trim($data['qr_payload']);
        $payload = json_decode($raw, true);
        if (is_array($payload)) {
            $serial = isset($payload['serial_number']) && is_string($payload['serial_number'])
                ? trim($payload['serial_number'])
                : null;
            $qrCode = isset($payload['qr_code']) && is_string($payload['qr_code'])
                ? trim($payload['qr_code'])
                : null;
        } else {
            $serial = $raw;
            $qrCode = $raw;
        }

        if (! $serial && ! $qrCode) {
            return response()->json(['message' => 'Invalid QR payload.'], 422);
        }

        $isPersonnel = $request->user()->hasRole(Role::PERSONNEL);
        $userId = $request->user()->user_id;
        $currentStatuses = [Transaction::STATUS_ACTIVE, Transaction::STATUS_OVERDUE];

        $firearm = FirearmEquipment::with([
            'category',
            'currentLocation',
            'transactions' => fn($q) => $q->whereIn('status', [Transaction::STATUS_ACTIVE, Transaction::STATUS_OVERDUE])
                ->with('user:user_id,first_name,last_name,rank')
                ->latest('checkout_at'),
        ])
            ->where(function ($query) use ($qrCode, $serial) {
                if ($qrCode && $serial && $qrCode !== $serial) {
                    $query->where('qr_code', $qrCode)->orWhere('serial_number', $serial);
                } elseif ($qrCode) {
                    $query->where('qr_code', $qrCode)->orWhere('serial_number', $qrCode);
                } elseif ($serial) {
                    $query->where('serial_number', $serial)->orWhere('qr_code', $serial);
                }
            })
            ->when($isPersonnel, fn($query) => $query->whereHas('transactions', fn($transaction) =>
                $transaction->where('user_id', $userId)->whereIn('status', $currentStatuses)
            ))
            ->first();

        if (! $firearm) {
            return response()->json(['message' => 'Firearm not found.'], 404);
        }

        AuditLogger::log(
            action: 'qr_scan',
            description: "QR scan resolved {$firearm->serial_number}",
            user: $request->user(),
            equipmentId: $firearm->equipment_id,
            request: $request,
        );

        return response()->json($firearm);
    }
}
