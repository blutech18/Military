<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Cache;

class SystemSetting extends Model
{
    protected $fillable = ['key', 'value'];

    /**
     * Get a setting value by key, with optional default.
     */
    public static function getValue(string $key, mixed $default = null): mixed
    {
        return Cache::remember("system_setting:{$key}", 60, function () use ($key, $default) {
            $setting = static::where('key', $key)->first();
            return $setting ? $setting->value : $default;
        });
    }

    /**
     * Set a setting value by key.
     */
    public static function setValue(string $key, mixed $value): void
    {
        static::updateOrCreate(['key' => $key], ['value' => $value]);
        Cache::forget("system_setting:{$key}");
    }

    /**
     * Check if session expiry is enabled.
     */
    public static function isSessionExpiryEnabled(): bool
    {
        return (bool) (int) static::getValue('session_expiry_enabled', '1');
    }

    /**
     * Check if TOTP is required system-wide.
     */
    public static function isTotpRequired(): bool
    {
        return (bool) (int) static::getValue('totp_required', '0');
    }

    /**
     * Check if biometric is required system-wide.
     */
    public static function isBiometricRequired(): bool
    {
        return (bool) (int) static::getValue('biometric_required', '0');
    }
}
