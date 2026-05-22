<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AuditLogController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = AuditLog::with(['user:user_id,username,first_name,last_name,rank', 'firearm:equipment_id,serial_number'])
            ->when($request->filled('action'), fn($qq) => $qq->where('action', $request->string('action')))
            ->when($request->filled('user_id'), fn($qq) => $qq->where('user_id', $request->integer('user_id')))
            ->when($request->filled('from'), fn($qq) => $qq->where('created_at', '>=', $request->date('from')))
            ->when($request->filled('to'), fn($qq) => $qq->where('created_at', '<=', $request->date('to')))
            ->latest('created_at');

        return response()->json($q->paginate($request->integer('per_page', 25)));
    }

    public function actions(): JsonResponse
    {
        return response()->json(AuditLog::select('action')->distinct()->pluck('action'));
    }
}
