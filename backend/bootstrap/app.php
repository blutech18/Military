<?php

use App\Http\Middleware\EnsureClearance;
use App\Http\Middleware\EnsureRole;
use App\Http\Middleware\ForceHttps;
use App\Http\Middleware\SanctumQueryToken;
use App\Http\Middleware\SecurityHeaders;
use App\Http\Middleware\StrictRateLimit;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Token-based API (Sanctum bearer). statefulApi() enables CSRF; not used here.
        $middleware->alias([
            'role'                => EnsureRole::class,
            'clearance'           => EnsureClearance::class,
            'rate.strict'         => StrictRateLimit::class,
            'auth.sanctum.query'  => SanctumQueryToken::class,
        ]);

        $middleware->append(ForceHttps::class);
        $middleware->append(SecurityHeaders::class);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        $isDatabaseUnavailable = function (\Throwable $e): bool {
            $message = $e->getMessage();

            return str_contains($message, 'SQLSTATE[HY000] [2002]')
                || str_contains($message, 'Connection refused')
                || str_contains($message, 'actively refused')
                || str_contains($message, 'No connection could be made');
        };

        $databaseUnavailableResponse = function () {
            return response()->json([
                'message' => 'Database service is unavailable. Please start MySQL/MariaDB and try again.',
                'code'    => 'DATABASE_UNAVAILABLE',
            ], 503);
        };

        $exceptions->render(function (QueryException $e, Request $request) use ($isDatabaseUnavailable, $databaseUnavailableResponse) {
            if ($isDatabaseUnavailable($e)) {
                return $databaseUnavailableResponse();
            }

            return null;
        });

        $exceptions->render(function (\PDOException $e, Request $request) use ($isDatabaseUnavailable, $databaseUnavailableResponse) {
            if ($isDatabaseUnavailable($e)) {
                return $databaseUnavailableResponse();
            }

            return null;
        });
    })->create();
