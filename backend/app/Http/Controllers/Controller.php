<?php

namespace App\Http\Controllers;

use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

abstract class Controller
{
    /**
     * Deletes need the signed-in user's password again, so an unattended session cannot be used
     * to remove records. A wrong password is itself written to the audit trail.
     *
     * @return JsonResponse|null the refusal, or null when the password is correct
     */
    protected function confirmPassword(Request $request, string $what): ?JsonResponse
    {
        $request->validate(['password' => ['required', 'string']], ['password.required' => 'Enter your password to confirm.']);

        if (Hash::check((string) $request->input('password'), $request->user()->password)) {
            return null;
        }

        AuditLogger::log(
            'password_confirm_failed',
            "Wrong password while confirming: {$what}",
            $request->user(),
            request: $request,
        );

        return response()->json([
            'message' => 'Incorrect password. Nothing was deleted.',
            'errors'  => ['password' => ['Incorrect password.']],
        ], 422);
    }
}
