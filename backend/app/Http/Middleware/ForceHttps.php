<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Redirects HTTP requests to HTTPS in production.
 * Manuscript requirement: HTTPS-only deployment.
 */
class ForceHttps
{
    /**
     * Paths that must answer over plain HTTP. Platform healthchecks (Railway,
     * Render, Kubernetes probes) hit the container directly on the internal
     * network and do not send X-Forwarded-Proto, so redirecting them would
     * make the deployment look permanently unhealthy.
     */
    private const EXCLUDED_PATHS = ['up'];

    public function handle(Request $request, Closure $next): Response
    {
        if (!$request->secure()
            && app()->environment('production')
            && !$request->is(...self::EXCLUDED_PATHS)) {
            return redirect()->secure($request->getRequestUri(), 301);
        }

        return $next($request);
    }
}
