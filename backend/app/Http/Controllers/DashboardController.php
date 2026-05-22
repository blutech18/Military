<?php

namespace App\Http\Controllers;

use App\Models\AuditLog;
use App\Models\FirearmEquipment;
use App\Models\Notification;
use App\Models\Transaction;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DashboardController extends Controller
{
    public function summary(Request $request): JsonResponse
    {
        $user = $request->user();
        $role = optional($user->role)->role_name;

        // ───────── PERSONNEL: restricted to own data ─────────
        if ($role === 'Personnel') {
            $myFirearmIds = Transaction::where('user_id', $user->user_id)
                ->whereIn('status', [Transaction::STATUS_ACTIVE, Transaction::STATUS_OVERDUE])
                ->pluck('equipment_id');

            $kpi = [
                'my_assigned'        => $myFirearmIds->count(),
                'my_active_tx'       => Transaction::where('user_id', $user->user_id)
                                            ->where('status', Transaction::STATUS_ACTIVE)->count(),
                'my_overdue'         => Transaction::where('user_id', $user->user_id)
                                            ->where('status', Transaction::STATUS_OVERDUE)->count(),
                'my_total_history'   => Transaction::where('user_id', $user->user_id)->count(),
                'my_alerts'          => Notification::where('user_id', $user->user_id)
                                            ->where('status', Notification::STATUS_UNREAD)->count(),
            ];

            $myTransactions = Transaction::with('firearm:equipment_id,serial_number,model,manufacturer')
                ->where('user_id', $user->user_id)
                ->latest('checkout_at')->limit(10)->get();

            // Include armory-wide chart data (non-sensitive aggregate stats)
            $byCondition = FirearmEquipment::selectRaw('condition_status, COUNT(*) as total')
                ->groupBy('condition_status')->get()
                ->mapWithKeys(fn($row) => [
                    ['Excellent', 'Good', 'Fair', 'Poor'][$row->condition_status - 1] ?? "Unknown" => $row->total,
                ]);

            $byStatus = FirearmEquipment::selectRaw('availability_status, COUNT(*) as total')
                ->groupBy('availability_status')->get()
                ->mapWithKeys(fn($row) => [
                    ['Available', 'Checked Out', 'Maintenance', 'Overdue'][$row->availability_status - 1] ?? "Unknown" => $row->total,
                ]);

            return response()->json([
                'role'                => $role,
                'kpi'                 => $kpi,
                'by_condition'        => $byCondition,
                'by_status'           => $byStatus,
                'my_transactions'     => $myTransactions,
                'my_assigned_ids'     => $myFirearmIds,
            ]);
        }

        // ───────── Shared data for all staff roles ─────────
        $kpi = [
            'total_firearms'     => FirearmEquipment::count(),
            'available'          => FirearmEquipment::where('availability_status', FirearmEquipment::STATUS_AVAILABLE)->count(),
            'checked_out'        => FirearmEquipment::where('availability_status', FirearmEquipment::STATUS_CHECKED_OUT)->count(),
            'maintenance'        => FirearmEquipment::where('availability_status', FirearmEquipment::STATUS_MAINTENANCE)->count(),
            'overdue'            => FirearmEquipment::where('availability_status', FirearmEquipment::STATUS_OVERDUE)->count(),
            'active_transactions'=> Transaction::where('status', Transaction::STATUS_ACTIVE)->count(),
            'unread_alerts'      => Notification::where('status', Notification::STATUS_UNREAD)->count(),
            'critical_alerts'    => Notification::where('severity', Notification::SEVERITY_CRITICAL)
                                        ->where('status', Notification::STATUS_UNREAD)->count(),
            'total_personnel'    => User::where('status', User::STATUS_ACTIVE)->count(),
        ];

        $byCondition = FirearmEquipment::selectRaw('condition_status, COUNT(*) as total')
            ->groupBy('condition_status')->get()
            ->mapWithKeys(fn($row) => [
                ['Excellent', 'Good', 'Fair', 'Poor'][$row->condition_status - 1] ?? "Unknown" => $row->total,
            ]);

        $byStatus = FirearmEquipment::selectRaw('availability_status, COUNT(*) as total')
            ->groupBy('availability_status')->get()
            ->mapWithKeys(fn($row) => [
                ['Available', 'Checked Out', 'Maintenance', 'Overdue'][$row->availability_status - 1] ?? "Unknown" => $row->total,
            ]);

        $driver = config('database.default');
        $monthExpr = $driver === 'sqlite'
            ? "strftime('%Y-%m', checkout_at)"
            : "DATE_FORMAT(checkout_at, '%Y-%m')";

        $monthlyTransactions = Transaction::selectRaw("{$monthExpr} as month, COUNT(*) as total")
            ->where('checkout_at', '>=', now()->subMonths(11)->startOfMonth())
            ->groupBy('month')->orderBy('month')->get();

        $recentTransactions = Transaction::with(['firearm:equipment_id,serial_number,model', 'user:user_id,first_name,last_name,rank'])
            ->latest('checkout_at')->limit(10)->get();

        $recentAudit = AuditLog::with('user:user_id,username,first_name,last_name,rank')
            ->latest('created_at')->limit(15)->get();

        return response()->json([
            'role'                 => $role,
            'kpi'                  => $kpi,
            'by_condition'         => $byCondition,
            'by_status'            => $byStatus,
            'monthly_transactions' => $monthlyTransactions,
            'recent_transactions'  => $recentTransactions,
            'recent_audit'         => $recentAudit,
        ]);
    }

    /**
     * Global search across firearms, users, and transactions.
     */
    public function search(Request $request): JsonResponse
    {
        $q = $request->string('q')->trim()->value();
        if (strlen($q) < 2) {
            return response()->json(['firearms' => [], 'users' => [], 'transactions' => []]);
        }

        $firearms = FirearmEquipment::where('serial_number', 'like', "%{$q}%")
            ->orWhere('model', 'like', "%{$q}%")
            ->orWhere('manufacturer', 'like', "%{$q}%")
            ->orWhere('qr_code', 'like', "%{$q}%")
            ->limit(10)->get(['equipment_id', 'serial_number', 'model', 'manufacturer', 'availability_status']);

        $users = User::where('username', 'like', "%{$q}%")
            ->orWhere('first_name', 'like', "%{$q}%")
            ->orWhere('last_name', 'like', "%{$q}%")
            ->orWhere('rank', 'like', "%{$q}%")
            ->limit(10)->get(['user_id', 'username', 'first_name', 'last_name', 'rank']);

        $transactions = Transaction::with('firearm:equipment_id,serial_number,model')
            ->whereHas('firearm', fn($fq) => $fq->where('serial_number', 'like', "%{$q}%"))
            ->orWhere('transaction_id', $q)
            ->limit(10)->get(['transaction_id', 'equipment_id', 'status', 'checkout_at']);

        return response()->json([
            'firearms'     => $firearms,
            'users'        => $users,
            'transactions' => $transactions,
        ]);
    }
}
