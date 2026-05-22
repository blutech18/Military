<?php

namespace App\Http\Controllers;

use App\Models\SystemSetting;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    /**
     * Get all system settings relevant to the admin panel.
     */
    public function index(): JsonResponse
    {
        return response()->json([
            'session_expiry_enabled' => SystemSetting::isSessionExpiryEnabled(),
            'totp_required'          => SystemSetting::isTotpRequired(),
            'biometric_required'     => SystemSetting::isBiometricRequired(),
        ]);
    }

    /**
     * Update system settings.
     */
    public function update(Request $request): JsonResponse
    {
        $data = $request->validate([
            'session_expiry_enabled' => 'sometimes|boolean',
            'totp_required'          => 'sometimes|boolean',
            'biometric_required'     => 'sometimes|boolean',
        ]);

        if (array_key_exists('session_expiry_enabled', $data)) {
            SystemSetting::setValue('session_expiry_enabled', $data['session_expiry_enabled'] ? '1' : '0');

            AuditLogger::log(
                'settings_update',
                'Session auto-expiry ' . ($data['session_expiry_enabled'] ? 'enabled' : 'disabled'),
                $request->user(),
                request: $request
            );
        }

        if (array_key_exists('totp_required', $data)) {
            SystemSetting::setValue('totp_required', $data['totp_required'] ? '1' : '0');

            AuditLogger::log(
                'settings_update',
                'System-wide TOTP requirement ' . ($data['totp_required'] ? 'enabled' : 'disabled'),
                $request->user(),
                request: $request
            );
        }

        if (array_key_exists('biometric_required', $data)) {
            SystemSetting::setValue('biometric_required', $data['biometric_required'] ? '1' : '0');

            AuditLogger::log(
                'settings_update',
                'System-wide biometric requirement ' . ($data['biometric_required'] ? 'enabled' : 'disabled'),
                $request->user(),
                request: $request
            );
        }

        return response()->json([
            'message'                => 'Settings updated.',
            'session_expiry_enabled' => SystemSetting::isSessionExpiryEnabled(),
            'totp_required'          => SystemSetting::isTotpRequired(),
            'biometric_required'     => SystemSetting::isBiometricRequired(),
        ]);
    }
}
