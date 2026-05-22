<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Laravel\Sanctum\PersonalAccessToken;
use Symfony\Component\HttpFoundation\Response;

/**
 * Authenticates requests via a Sanctum personal access token supplied in the
 * `?token=` query string. Used for routes that the browser EventSource API
 * connects to, since EventSource cannot set Authorization headers.
 *
 * The token is consumed by reference only — it is never logged, never echoed
 * back, and the URL-bound token is not persisted in audit logs (see
 * AuditLogger sanitisation). For production, terminate SSE behind HTTPS only.
 */
class SanctumQueryToken
{
    public function handle(Request $request, Closure $next): Response
    {
        $raw = (string) $request->query('token', '');

        if ($raw === '') {
            return response()->json(['message' => 'Missing token.'], 401);
        }

        $accessToken = PersonalAccessToken::findToken($raw);

        if (! $accessToken || ! $accessToken->tokenable) {
            return response()->json(['message' => 'Invalid token.'], 401);
        }

        // Bind the resolved user to the request so the controller can read $request->user().
        $request->setUserResolver(fn () => $accessToken->tokenable);

        // Update last-used (best-effort, non-blocking).
        $accessToken->forceFill(['last_used_at' => now()])->save();

        return $next($request);
    }
}
