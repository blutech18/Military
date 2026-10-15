<?php

use App\Services\AuditChain;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Client revision: assurance that no one, the Command Officer included, can quietly change or
 * remove what the audit trail recorded.
 *
 * 1. Each entry is chained to the one before it by an HMAC signature (App\Services\AuditChain),
 *    so an altered or deleted entry shows up when the trail is verified.
 * 2. The database itself rejects UPDATE and DELETE on audit_logs.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('audit_logs', function (Blueprint $table) {
            $table->char('prev_hash', 64)->nullable()->after('metadata');
            $table->char('hash', 64)->nullable()->after('prev_hash');
            $table->index('hash');
        });

        // Sign the existing history as one chain, oldest first.
        $prev = null;
        DB::table('audit_logs')->orderBy('log_id')->chunkById(500, function ($rows) use (&$prev) {
            foreach ($rows as $row) {
                $hash = AuditChain::sign($prev, AuditChain::fieldsOf($row));
                DB::table('audit_logs')->where('log_id', $row->log_id)->update(['prev_hash' => $prev, 'hash' => $hash]);
                $prev = $hash;
            }
        }, 'log_id');

        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::unprepared('DROP TRIGGER IF EXISTS audit_logs_block_update');
            DB::unprepared('DROP TRIGGER IF EXISTS audit_logs_block_delete');
            DB::unprepared(
                "CREATE TRIGGER audit_logs_block_update BEFORE UPDATE ON audit_logs FOR EACH ROW
                 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only: entries cannot be changed'"
            );
            DB::unprepared(
                "CREATE TRIGGER audit_logs_block_delete BEFORE DELETE ON audit_logs FOR EACH ROW
                 SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'audit_logs is append-only: entries cannot be deleted'"
            );
        }
    }

    public function down(): void
    {
        if (in_array(DB::getDriverName(), ['mysql', 'mariadb'], true)) {
            DB::unprepared('DROP TRIGGER IF EXISTS audit_logs_block_update');
            DB::unprepared('DROP TRIGGER IF EXISTS audit_logs_block_delete');
        }

        Schema::table('audit_logs', function (Blueprint $table) {
            $table->dropIndex(['hash']);
            $table->dropColumn(['prev_hash', 'hash']);
        });
    }
};
