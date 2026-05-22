<?php

namespace App\Http\Middleware;

use App\Models\Notification;
use App\Services\AuditLogger;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureClearance
{
    /**
     * Usage: ->middleware('clearance:2')   // Secret or Top Secret
     */
    public function handle(Request $request, Closure $next, int $minLevel = 1): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        if ((int) $user->security_clearance < $minLevel) {
            AuditLogger::log(
                action: 'access_denied',
                description: "Insufficient clearance for {$request->path()}",
                user: $user,
                request: $request,
                metadata: ['required_clearance' => $minLevel, 'user_clearance' => $user->security_clearance],
            );

            Notification::create([
                'user_id'  => $user->user_id,
                'type'     => 'unauthorized_access',
                'severity' => Notification::SEVERITY_WARNING,
                'title'    => 'Clearance Violation',
                'message'  => "Attempted to access {$request->path()} requiring clearance level {$minLevel}.",
                'payload'  => ['required_clearance' => $minLevel, 'user_clearance' => $user->security_clearance, 'ip' => $request->ip()],
            ]);

            return response()->json([
                'message'         => 'Forbidden — insufficient security clearance.',
                'required_level'  => $minLevel,
                'your_clearance'  => $user->security_clearance,
            ], 403);
        }

        return $next($request);
    }
}
