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
    public function handle(Request $request, Closure $next): Response
    {
        if (!$request->secure() && app()->environment('production')) {
            return redirect()->secure($request->getRequestUri(), 301);
        }

        return $next($request);
    }
}
