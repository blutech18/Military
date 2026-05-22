<?php

namespace App\Http\Middleware;

use App\Models\Notification;
use App\Services\AuditLogger;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class EnsureRole
{
    /**
     * Usage: ->middleware('role:Administrator,S4 Officer,Armory Custodian')
     */
    public function handle(Request $request, Closure $next, string ...$allowed): Response
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['message' => 'Unauthenticated.'], 401);
        }

        $role = optional($user->role)->role_name;
        if (! in_array($role, $allowed, true)) {
            AuditLogger::log(
                action: 'access_denied',
                description: "Forbidden: role {$role} cannot access {$request->method()} {$request->path()}",
                user: $user,
                request: $request,
                metadata: ['required_roles' => $allowed],
            );

            Notification::create([
                'user_id'  => $user->user_id,
                'type'     => 'unauthorized_access',
                'severity' => Notification::SEVERITY_WARNING,
                'title'    => 'Unauthorized Access Attempt',
                'message'  => "Attempted to access {$request->method()} {$request->path()} without required role.",
                'payload'  => ['required_roles' => $allowed, 'user_role' => $role, 'ip' => $request->ip()],
            ]);

            return response()->json([
                'message'        => 'Forbidden — insufficient role.',
                'required_roles' => $allowed,
                'your_role'      => $role,
            ], 403);
        }

        return $next($request);
    }
}
