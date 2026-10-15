<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Cache\RateLimiter;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use PDOException;
use Symfony\Component\HttpFoundation\Response;

/**
 * Enforces the strict 5 requests / second / user-IP rate limit
 * required by the SRS (NFR-Security: API Protection).
 */
class StrictRateLimit
{
    public function __construct(private RateLimiter $limiter) {}

    public function handle(Request $request, Closure $next, int $perSecond = 0): Response
    {
        $perSecond = $perSecond > 0
            ? $perSecond
            : (int) config('armory.rate_limit_per_second', 5);

        // This runs before auth:sanctum, and the default guard is the session one, so a plain
        // $request->user() is always null for API tokens: every signed-in user on one machine
        // would share a single "guest" bucket. Ask the Sanctum guard (it caches the user, so
        // auth:sanctum does not look the token up twice).
        $user = $request->user() ?? $request->user('sanctum');

        // The limit is part of the key: routes with their own budget (topbar polling at 30/s, IoT
        // ingest at 60/s) must not use up the default budget of normal requests.
        $key = sprintf(
            'armory-rl:%d:%s:%s',
            $perSecond,
            optional($user)->user_id ?? 'guest',
            $request->ip()
        );

        try {
            if ($this->limiter->tooManyAttempts($key, $perSecond)) {
                return response()->json([
                    'message' => 'Too many requests. Please slow down.',
                    'limit'   => $perSecond,
                    'window'  => '1 second',
                ], Response::HTTP_TOO_MANY_REQUESTS, [
                    'Retry-After' => 1,
                ]);
            }

            // 1-second decay window — passing 1/60 minutes ≈ 1 second.
            $this->limiter->hit($key, 1);
        } catch (QueryException|PDOException $e) {
            if ($this->isDatabaseUnavailable($e)) {
                return response()->json([
                    'message' => 'Database service is unavailable. Please start MySQL and try again.',
                    'code'    => 'DATABASE_UNAVAILABLE',
                ], Response::HTTP_SERVICE_UNAVAILABLE);
            }

            throw $e;
        }

        $response = $next($request);

        try {
            return $response
                ->header('X-RateLimit-Limit', (string) $perSecond)
                ->header('X-RateLimit-Remaining', (string) max(0, $perSecond - $this->limiter->attempts($key)));
        } catch (QueryException|PDOException $e) {
            if ($this->isDatabaseUnavailable($e)) {
                return $response->header('X-RateLimit-Limit', (string) $perSecond);
            }

            throw $e;
        }
    }

    private function isDatabaseUnavailable(QueryException|PDOException $e): bool
    {
        $message = $e->getMessage();

        return str_contains($message, 'SQLSTATE[HY000] [2002]')
            || str_contains($message, 'Connection refused')
            || str_contains($message, 'actively refused')
            || str_contains($message, 'No connection could be made');
    }
}
