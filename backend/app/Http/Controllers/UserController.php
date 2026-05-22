<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class UserController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $q = User::with('role')
            ->when($request->filled('role'), fn($qq) => $qq->whereHas('role', fn($r) => $r->where('role_name', $request->string('role'))))
            ->when($request->boolean('only_active'), fn($qq) => $qq->where('status', User::STATUS_ACTIVE))
            ->when($request->string('search')->trim()->value(), function ($qq, $s) {
                $qq->where(fn($w) => $w->where('username', 'like', "%{$s}%")
                    ->orWhere('first_name', 'like', "%{$s}%")
                    ->orWhere('last_name', 'like', "%{$s}%")
                    ->orWhere('rank', 'like', "%{$s}%"));
            })
            ->orderBy('last_name');

        return response()->json($q->paginate($request->integer('per_page', 15)));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'username'           => ['required', 'string', 'max:50', 'unique:users,username'],
            'email'              => ['required', 'email', 'max:100', 'unique:users,email'],
            'password'           => ['required', 'string', 'min:10', 'max:200'],
            'first_name'         => ['required', 'string', 'max:50'],
            'last_name'          => ['required', 'string', 'max:50'],
            'rank'               => ['required', 'string', 'max:30'],
            'phone'              => ['nullable', 'string', 'max:11'],
            'role_id'            => ['required', 'exists:roles,role_id'],
            'security_clearance' => ['required', 'integer', 'between:1,3'],
            'status'             => ['nullable', 'integer', 'in:0,1'],
        ]);

        $data['password'] = Hash::make($data['password']);
        $data['status']   = $data['status'] ?? User::STATUS_ACTIVE;

        $user = User::create($data);
        AuditLogger::log('user_create', "Created user {$user->username}", $request->user(), request: $request);
        return response()->json($user->fresh('role'), 201);
    }

    public function show(int $id): JsonResponse
    {
        return response()->json(User::with('role')->findOrFail($id));
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        $data = $request->validate([
            'email'              => ['sometimes', 'email', 'max:100', Rule::unique('users', 'email')->ignore($user->user_id, 'user_id')],
            'first_name'         => ['sometimes', 'string', 'max:50'],
            'last_name'          => ['sometimes', 'string', 'max:50'],
            'rank'               => ['sometimes', 'string', 'max:30'],
            'phone'              => ['sometimes', 'nullable', 'string', 'max:11'],
            'role_id'            => ['sometimes', 'exists:roles,role_id'],
            'security_clearance' => ['sometimes', 'integer', 'between:1,3'],
            'status'             => ['sometimes', 'integer', 'in:0,1'],
            'password'           => ['sometimes', 'string', 'min:10', 'max:200'],
        ]);

        if (isset($data['password'])) {
            $data['password'] = Hash::make($data['password']);
        }

        $user->update($data);
        AuditLogger::log('user_update', "Updated user {$user->username}", $request->user(), request: $request, metadata: ['fields' => array_keys($data)]);

        return response()->json($user->fresh('role'));
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        if ($user->user_id === $request->user()->user_id) {
            return response()->json(['message' => 'Cannot delete yourself.'], 422);
        }

        $user->update(['status' => User::STATUS_INACTIVE]);
        $user->delete();

        AuditLogger::log('user_delete', "Soft-deleted user {$user->username}", $request->user(), request: $request);
        return response()->json(['message' => 'User archived.']);
    }

    public function roles(): JsonResponse
    {
        return response()->json(Role::orderBy('role_name')->get());
    }

    /**
     * Admin-only: Reset a user's MFA (TOTP + biometric) so they re-enroll on next login.
     */
    public function resetMfa(Request $request, int $id): JsonResponse
    {
        $user = User::findOrFail($id);

        $user->update([
            'totp_secret'       => null,
            'totp_enabled'      => false,
            'biometric_data'    => null,
            'biometric_enrolled'=> false,
        ]);

        AuditLogger::log(
            action: 'mfa_reset',
            description: "MFA reset for user {$user->username} by admin",
            user: $request->user(),
            request: $request,
            metadata: ['target_user_id' => $user->user_id],
        );

        return response()->json(['message' => "MFA reset for {$user->username}. They will re-enroll on next login."]);
    }
}
