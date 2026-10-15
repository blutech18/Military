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

        $fields = [
            'user_id'      => $user?->user_id,
            'equipment_id' => $equipmentId,
            'action'       => $action,
            'description'  => mb_substr($description, 0, 500),
            'role'         => optional($user?->role)->role_name,
            'ip_address'   => $request?->ip() ?? '0.0.0.0',
            'user_agent'   => mb_substr((string) $request?->userAgent(), 0, 500),
            'metadata'     => empty($metadata) ? null : $metadata,
            // Whole seconds: the column has no fractions, and the signature must match what is stored.
            'created_at'   => now()->startOfSecond(),
        ];

        $prev = AuditChain::head();
        $signed = ['created_at' => $fields['created_at']->format('Y-m-d H:i:s')] + $fields;

        return AuditLog::create($fields + [
            'prev_hash' => $prev,
            'hash'      => AuditChain::sign($prev, $signed),
        ]);
    }

    /**
     * Field-by-field before/after of what an edit actually changed, for the audit trail.
     * Secrets are reported as changed without their values.
     *
     * @return array<string, array{from:mixed, to:mixed}>
     */
    public static function diff(array $before, array $after, array $secret = ['password']): array
    {
        $changes = [];
        foreach ($after as $field => $to) {
            $from = $before[$field] ?? null;
            if ($from instanceof \DateTimeInterface) {
                $from = $from->format('Y-m-d H:i:s');
            }
            if ($to instanceof \DateTimeInterface) {
                $to = $to->format('Y-m-d H:i:s');
            }
            if (in_array($field, $secret, true)) {
                $changes[$field] = ['from' => '••••', 'to' => '•••• (changed)'];
                continue;
            }
            if (! self::same($from, $to)) {
                $changes[$field] = ['from' => $from, 'to' => $to];
            }
        }
        return $changes;
    }

    /** "8.4844600" equals 8.48446 and "1" equals true: the database and the request disagree on types. */
    private static function same(mixed $a, mixed $b): bool
    {
        if (is_bool($a) || is_bool($b)) {
            return (int) (bool) $a === (int) (bool) $b;
        }
        if (is_numeric($a) && is_numeric($b)) {
            return abs((float) $a - (float) $b) < 1e-9;
        }
        if (is_array($a) || is_array($b)) {
            return json_encode($a) === json_encode(is_string($b) ? json_decode($b, true) : $b)
                || json_encode(is_string($a) ? json_decode($a, true) : $a) === json_encode($b);
        }
        // "2026-11-01" from a form and "2026-11-01 00:00:00" from the database are the same date.
        $date = '/^\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?$/';
        if (is_string($a) && is_string($b) && preg_match($date, $a) && preg_match($date, $b)) {
            return strtotime($a) === strtotime($b);
        }
        return (string) $a === (string) $b;
    }
}
