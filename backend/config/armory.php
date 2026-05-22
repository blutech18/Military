<?php

return [
    'gps' => [
        'interval_seconds'      => (int) env('ARMORY_GPS_INTERVAL_SECONDS', 30),
        'latency_budget_seconds'=> (int) env('ARMORY_GPS_LATENCY_BUDGET_SECONDS', 5),
        'accuracy_meters'       => (int) env('ARMORY_GPS_ACCURACY_METERS', 10),
    ],

    'session' => [
        'timeout_minutes' => (int) env('ARMORY_SESSION_TIMEOUT_MINUTES', 15),
    ],

    'rate_limit_per_second' => (int) env('ARMORY_RATE_LIMIT_PER_SECOND', 5),
    'failed_login_threshold'=> (int) env('ARMORY_FAILED_LOGIN_THRESHOLD', 3),
    'lockout_attempts'      => (int) env('ARMORY_LOCKOUT_ATTEMPTS', 5),
    'lockout_minutes'       => (int) env('ARMORY_LOCKOUT_MINUTES', 30),
    'default_overdue_hours' => (int) env('ARMORY_DEFAULT_OVERDUE_HOURS', 24),

    'iot' => [
        'hmac_secret' => env('IOT_HMAC_SECRET', ''),
    ],

    'recaptcha' => [
        'site_key'  => env('RECAPTCHA_SITE_KEY', ''),
        'secret'    => env('RECAPTCHA_SECRET_KEY', ''),
        'min_score' => (float) env('RECAPTCHA_MIN_SCORE', 0.5),
    ],

    'totp' => [
        'issuer' => env('TOTP_ISSUER', 'ArmoryDB-10RCDG'),
        'digits' => (int) env('TOTP_DIGITS', 6),
        'period' => (int) env('TOTP_PERIOD', 30),
    ],
];
