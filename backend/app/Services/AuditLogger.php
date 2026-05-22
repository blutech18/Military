<?php

namespace App\Services;

use App\Models\AuditLog;
use App\Models\User;
use Illuminate\Http\Request;

class AuditLogger
{
    public static function log(
        string $action,
        string $description,
        ?User $user = null,
        ?int $equipmentId = null,
        ?Request $request = null,
        array $metadata = []
    ): AuditLog {
        $request = $request ?? request();

        return AuditLog::create([
            'user_id'      => $user?->user_id,
            'equipment_id' => $equipmentId,
            'action'       => $action,
            'description'  => mb_substr($description, 0, 500),
            'role'         => optional($user?->role)->role_name,
            'ip_address'   => $request?->ip() ?? '0.0.0.0',
            'user_agent'   => mb_substr((string) $request?->userAgent(), 0, 500),
            'metadata'     => empty($metadata) ? null : $metadata,
            'created_at'   => now(),
        ]);
    }
}
