<?php

use App\Http\Controllers\AuditLogController;
use App\Http\Controllers\Auth\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\FirearmController;
use App\Http\Controllers\GpsController;
use App\Http\Controllers\GpsLocationController;
use App\Http\Controllers\MaintenanceController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\ReportController;
use App\Http\Controllers\SettingsController;
use App\Http\Controllers\TransactionController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;

/*
|------------------------------------------------------------------------------
| ArmoryDB · REST API · /api/v1
|------------------------------------------------------------------------------
|  All endpoints are protected by the strict 5-req/s rate limit.
|  Authenticated endpoints additionally require a Sanctum token + role/clearance.
*/

Route::middleware('rate.strict')->prefix('v1')->group(function () {

    // ----- Public auth flow (challenge → totp → biometric → sanctum) -----
    Route::prefix('auth')->group(function () {
        Route::get('requirements',        [AuthController::class, 'requirements']);
        Route::post('login',             [AuthController::class, 'login']);
        Route::post('totp/setup',        [AuthController::class, 'totpSetup']);
        Route::post('totp/verify',       [AuthController::class, 'totpVerify']);
        Route::post('biometric/verify',  [AuthController::class, 'biometricVerify']);
    });

    // ----- IoT GPS ingest (HMAC-signed, no Sanctum) -----
    Route::post('gps/ingest', [GpsController::class, 'ingest'])
        ->middleware('rate.strict:60'); // GPS devices may burst slightly higher

    // ----- Authenticated routes -----
    Route::middleware('auth:sanctum')->group(function () {

        Route::get('auth/me',      [AuthController::class, 'me']);
        Route::post('auth/logout', [AuthController::class, 'logout']);
        Route::post('auth/change-password', [AuthController::class, 'changePassword']);
        Route::post('auth/verify-password', [AuthController::class, 'verifyPassword']);
        Route::post('auth/reset-totp',      [AuthController::class, 'resetTotp']);
        Route::post('auth/reset-biometric', [AuthController::class, 'resetBiometric']);
        Route::post('auth/enable-totp',     [AuthController::class, 'enableTotp']);
        Route::post('auth/enable-biometric',[AuthController::class, 'enableBiometric']);

        // Global search
        Route::get('search', [DashboardController::class, 'search']);

        // Dashboard / live map / notifications — accessible to all authenticated roles
        Route::get('dashboard/summary', [DashboardController::class, 'summary']);
        Route::get('gps/live',          [GpsController::class, 'liveMap']);
        Route::get('gps/history/{equipmentId}', [GpsController::class, 'history']);

        Route::get('notifications',                  [NotificationController::class, 'index']);
        Route::get('notifications/unread',           [NotificationController::class, 'unread']);
        Route::patch('notifications/{id}/read',      [NotificationController::class, 'markRead']);
        Route::post('notifications/mark-all-read',   [NotificationController::class, 'markAllRead']);

        // Equipment categories
        Route::get('categories', [FirearmController::class, 'categories']);

        // Firearms
        Route::get('firearms',                  [FirearmController::class, 'index']);
        Route::get('firearms/{id}',             [FirearmController::class, 'show']);
        Route::get('firearms/{id}/qr',          [FirearmController::class, 'qrCode']);
        Route::post('firearms/lookup',          [FirearmController::class, 'lookup']);

        // S4 Officer / Armory Custodian / Administrator can mutate inventory
        Route::middleware('role:Administrator,S4 Officer,Armory Custodian')->group(function () {
            Route::post('firearms',                  [FirearmController::class, 'store']);
            Route::patch('firearms/{id}',            [FirearmController::class, 'update']);
            Route::delete('firearms/{id}',           [FirearmController::class, 'destroy']);
            Route::post('transactions/issue',        [TransactionController::class, 'issue']);
            Route::patch('transactions/{id}/return', [TransactionController::class, 'returnFirearm']);
            Route::post('transactions/sweep-overdue',[TransactionController::class, 'sweepOverdue']);
            Route::post('maintenance',               [MaintenanceController::class, 'store']);
        });

        Route::get('transactions',         [TransactionController::class, 'index']);
        Route::get('transactions/{id}',    [TransactionController::class, 'show']);

        Route::get('maintenance',          [MaintenanceController::class, 'index']);

        // Geofences / locations — admin & S4
        Route::get('locations',            [GpsLocationController::class, 'index']);
        Route::middleware('role:Administrator,S4 Officer')->group(function () {
            Route::post('locations',           [GpsLocationController::class, 'store']);
            Route::patch('locations/{id}',     [GpsLocationController::class, 'update']);
            Route::delete('locations/{id}',    [GpsLocationController::class, 'destroy']);
        });

        // User management — admin only
        Route::middleware('role:Administrator')->group(function () {
            Route::get('users',                [UserController::class, 'index']);
            Route::get('users/roles',          [UserController::class, 'roles']);
            Route::post('users',               [UserController::class, 'store']);
            Route::get('users/{id}',           [UserController::class, 'show']);
            Route::patch('users/{id}',         [UserController::class, 'update']);
            Route::delete('users/{id}',        [UserController::class, 'destroy']);
            Route::post('users/{id}/reset-mfa',[UserController::class, 'resetMfa']);

            // System settings
            Route::get('settings',             [SettingsController::class, 'index']);
            Route::patch('settings',           [SettingsController::class, 'update']);
        });

        // Audit logs — Top Secret clearance only (Admins / Command Officer / S4)
        Route::middleware('clearance:2')->group(function () {
            Route::get('audit-logs',           [AuditLogController::class, 'index']);
            Route::get('audit-logs/actions',   [AuditLogController::class, 'actions']);
        });

        // Reports
        Route::prefix('reports')->group(function () {
            Route::get('inventory',                  [ReportController::class, 'inventory']);
            Route::get('transactions',               [ReportController::class, 'transactions']);
            Route::get('audit',                      [ReportController::class, 'audit']);
            Route::get('maintenance',                [ReportController::class, 'maintenance']);
            Route::get('personnel-assignment',       [ReportController::class, 'personnelAssignment']);
            Route::get('security-incidents',         [ReportController::class, 'securityIncidents']);
            Route::get('gps/{equipmentId}',          [ReportController::class, 'gpsHistory']);
        });
    });
});

// ----- High-frequency real-time endpoints, outside the default strict limiter -----
// These are tight idempotent reads polled by the topbar at sub-second cadence.
// They get their own 30 req/s bucket so they don't compete with normal user
// actions on the strict 5 req/s default.
Route::prefix('v1')->group(function () {
    // SSE stream — long-lived connection, no per-request rate limit.
    Route::get('gps/iot-stream', [GpsController::class, 'iotStream'])
        ->middleware('auth.sanctum.query');

    // Polling fallback — fits comfortably under a 30 req/s bucket.
    Route::get('gps/iot-status', [GpsController::class, 'iotStatus'])
        ->middleware(['auth:sanctum', 'rate.strict:30']);
});

Route::get('/health', fn () => response()->json([
    'status'  => 'ok',
    'service' => 'ArmoryDB API',
    'version' => '1.0.0',
    'time'    => now()->toIso8601String(),
]));
