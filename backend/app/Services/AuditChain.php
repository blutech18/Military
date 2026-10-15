<?php

namespace App\Services;

use App\Models\AuditLog;
use Illuminate\Support\Facades\DB;

/**
 * Makes the audit trail tamper-evident.
 *
 * Every entry is signed with an HMAC (keyed by APP_KEY) over its content plus the signature
 * of the entry written before it. Editing an entry breaks its own signature; deleting one
 * leaves the next entry pointing at a signature that no longer exists. On top of this, the
 * database refuses UPDATE and DELETE on audit_logs outright (see the 2026_10_15 migration).
 *
 * Two requests logging at the same instant may both point at the same predecessor. That
 * fork is harmless and verify() accepts it; what it rejects is a pointer to nothing.
 */
class AuditChain
{
    /** Signature of the newest entry this connection can see, or null for an empty log. */
    public static function head(): ?string
    {
        return DB::table('audit_logs')->orderByDesc('log_id')->value('hash');
    }

    /**
     * @param array{user_id:?int, equipment_id:?int, action:string, description:string, role:?string,
     *              ip_address:string, user_agent:?string, metadata:?array, created_at:string} $row
     */
    public static function sign(?string $prevHash, array $row): string
    {
        return hash_hmac('sha256', self::canonical($prevHash, $row), self::key());
    }

    /** Fields of a stored entry in the shape sign() expects. */
    public static function fieldsOf(AuditLog|\stdClass $log): array
    {
        $metadata = $log->metadata;
        if (is_string($metadata)) {
            $metadata = json_decode($metadata, true);
        }
        $createdAt = $log->created_at;

        return [
            'user_id'      => $log->user_id !== null ? (int) $log->user_id : null,
            'equipment_id' => $log->equipment_id !== null ? (int) $log->equipment_id : null,
            'action'       => (string) $log->action,
            'description'  => (string) $log->description,
            'role'         => $log->role,
            'ip_address'   => (string) $log->ip_address,
            'user_agent'   => $log->user_agent,
            'metadata'     => $metadata ?: null,
            'created_at'   => $createdAt instanceof \DateTimeInterface ? $createdAt->format('Y-m-d H:i:s') : (string) $createdAt,
        ];
    }

    /**
     * Walks the whole log in order and reports every entry that was altered, or whose
     * predecessor is missing.
     *
     * @return array{intact:bool, checked:int, first_log_id:?int, last_log_id:?int, last_logged_at:?string, issues:array}
     */
    public static function verify(int $maxIssues = 50): array
    {
        $rows = (function () {
            foreach (DB::table('audit_logs')->orderBy('log_id')->lazyById(1000, 'log_id') as $row) {
                yield $row;
            }
        })();

        return self::verifyRows($rows, $maxIssues);
    }

    /**
     * @param iterable<\stdClass> $rows audit_logs rows in log_id order
     */
    public static function verifyRows(iterable $rows, int $maxIssues = 50): array
    {
        $seen = [];
        $issues = [];
        $issueCount = 0;
        $checked = 0;
        $first = null;
        $last = null;
        $lastAt = null;

        $report = function (int $logId, string $problem) use (&$issues, &$issueCount, $maxIssues) {
            $issueCount++;
            if (count($issues) < $maxIssues) {
                $issues[] = ['log_id' => $logId, 'problem' => $problem];
            }
        };

        foreach ($rows as $row) {
            $checked++;
            $first ??= (int) $row->log_id;
            $last = (int) $row->log_id;
            $lastAt = (string) $row->created_at;

            if (! $row->hash) {
                $report((int) $row->log_id, 'Entry has no signature.');
                continue;
            }
            if (! hash_equals(self::sign($row->prev_hash, self::fieldsOf($row)), $row->hash)) {
                $report((int) $row->log_id, 'Entry was altered after it was written.');
            }
            if ($row->prev_hash === null ? $checked > 1 : ! isset($seen[$row->prev_hash])) {
                $report((int) $row->log_id, 'The entry written before this one is missing (deleted).');
            }
            $seen[$row->hash] = true;
        }

        return [
            'intact'         => $issueCount === 0,
            'checked'        => $checked,
            'issue_count'    => $issueCount,
            'first_log_id'   => $first,
            'last_log_id'    => $last,
            'last_logged_at' => $lastAt,
            'issues'         => $issues,
        ];
    }

    private static function canonical(?string $prevHash, array $row): string
    {
        // Round-trip through JSON so dates and objects encode exactly as they are stored.
        $metadata = empty($row['metadata'])
            ? null
            : self::sortKeys(json_decode(json_encode($row['metadata'], JSON_INVALID_UTF8_SUBSTITUTE), true));

        // Fixed types, so writing (ids as int) and verifying (ids as read back) always agree.
        return json_encode([
            'prev'         => $prevHash,
            'user_id'      => $row['user_id'] === null ? null : (int) $row['user_id'],
            'equipment_id' => $row['equipment_id'] === null ? null : (int) $row['equipment_id'],
            'action'       => (string) $row['action'],
            'description'  => (string) $row['description'],
            'role'         => $row['role'] === null ? null : (string) $row['role'],
            'ip_address'   => (string) $row['ip_address'],
            'user_agent'   => $row['user_agent'] === null ? null : (string) $row['user_agent'],
            'metadata'     => $metadata,
            'created_at'   => (string) $row['created_at'],
        ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRESERVE_ZERO_FRACTION | JSON_INVALID_UTF8_SUBSTITUTE);
    }

    private static function sortKeys(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        if (! array_is_list($value)) {
            ksort($value);
        }
        return array_map([self::class, 'sortKeys'], $value);
    }

    private static function key(): string
    {
        return 'armorydb-audit-chain|' . config('app.key');
    }
}
