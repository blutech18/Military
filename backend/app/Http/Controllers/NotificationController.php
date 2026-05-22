<?php

namespace App\Http\Controllers;

use App\Models\Notification;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = Notification::with('firearm:equipment_id,serial_number,model')
            ->where('user_id', $request->user()->user_id)
            ->when($request->filled('status'), fn($q) => $q->where('status', $request->string('status')))
            ->latest('created_at')
            ->paginate($request->integer('per_page', 20));

        return response()->json($items);
    }

    public function unread(Request $request): JsonResponse
    {
        $items = Notification::where('user_id', $request->user()->user_id)
            ->where('status', Notification::STATUS_UNREAD)
            ->latest()->limit(50)->get();
        return response()->json(['items' => $items, 'count' => $items->count()]);
    }

    public function markRead(Request $request, int $id): JsonResponse
    {
        $n = Notification::where('user_id', $request->user()->user_id)->findOrFail($id);
        $n->update(['status' => Notification::STATUS_READ, 'read_at' => now()]);
        return response()->json($n);
    }

    public function markAllRead(Request $request): JsonResponse
    {
        Notification::where('user_id', $request->user()->user_id)
            ->where('status', Notification::STATUS_UNREAD)
            ->update(['status' => Notification::STATUS_READ, 'read_at' => now()]);
        return response()->json(['message' => 'All notifications marked as read.']);
    }
}
