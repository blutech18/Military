<?php

namespace Tests\Feature;

use App\Models\SystemSetting;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();

        User::where('username', 'admin')->update([
            'password' => Hash::make('Admin@10RCDG!2025'),
        ]);
        SystemSetting::setValue('totp_required', '1');
        SystemSetting::setValue('biometric_required', '0');
        config([
            'armory.demo_mode' => false,
            'armory.failed_login_threshold' => 3,
        ]);
    }

    public function test_login_with_valid_credentials_returns_challenge_token(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'Admin@10RCDG!2025',
        ]);

        $response->assertOk()
            ->assertJsonStructure(['challenge_token', 'next', 'totp_enabled', 'biometric_enrolled']);
    }

    public function test_login_with_invalid_credentials_returns_401(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(401)
            ->assertJson(['message' => 'Invalid credentials.']);
    }

    public function test_login_with_unknown_user_returns_401(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'username' => 'nonexistent',
            'password' => 'whatever',
        ]);

        $response->assertStatus(401);
    }

    public function test_recaptcha_required_after_threshold_failures(): void
    {
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/v1/auth/login', [
                'username' => 'admin',
                'password' => 'wrong',
            ]);
        }

        $response = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'wrong',
        ]);

        $response->assertStatus(429)
            ->assertJson(['recaptcha_required' => true]);
    }

    public function test_account_locks_after_max_failures(): void
    {
        config(['armory.lockout_attempts' => 3]);

        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/v1/auth/login', [
                'username' => 'admin',
                'password' => 'wrong',
                'recaptcha_token' => 'bypass',
            ]);
        }

        $user = User::where('username', 'admin')->first();
        $this->assertNotNull($user->locked_until);
        $this->assertTrue($user->isLocked());
    }

    public function test_locked_account_cannot_login(): void
    {
        $user = User::where('username', 'admin')->first();
        $user->update(['locked_until' => now()->addMinutes(30)]);

        $response = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'Admin@10RCDG!2025',
        ]);

        $response->assertStatus(423)
            ->assertJson(['message' => 'Account is locked.']);
    }

    public function test_inactive_account_cannot_login(): void
    {
        $user = User::where('username', 'admin')->first();
        $user->update(['status' => User::STATUS_INACTIVE]);

        $response = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'Admin@10RCDG!2025',
        ]);

        $response->assertStatus(403);
    }

    public function test_login_returns_token_only_when_mfa_is_disabled(): void
    {
        SystemSetting::setValue('totp_required', '0');
        SystemSetting::setValue('biometric_required', '0');

        $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'Admin@10RCDG!2025',
        ])->assertOk()
            ->assertJsonStructure(['token', 'user'])
            ->assertJsonMissing(['challenge_token']);
    }

    public function test_biometric_cannot_skip_required_totp_step(): void
    {
        SystemSetting::setValue('biometric_required', '1');

        $login = $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'Admin@10RCDG!2025',
        ])->assertOk();

        $this->postJson('/api/v1/auth/biometric/verify', [
            'challenge_token' => $login->json('challenge_token'),
            'fingerprint' => str_repeat('a', 32),
            'source' => 'futronic_bridge',
        ])->assertStatus(403)
            ->assertJson(['message' => 'Complete TOTP verification first.']);
    }

    public function test_recaptcha_accepts_only_matching_action_score_and_hostname(): void
    {
        config([
            'armory.failed_login_threshold' => 1,
            'armory.recaptcha.secret' => 'test-secret',
            'armory.recaptcha.verify_url' => 'https://recaptcha.test/verify',
            'armory.recaptcha.expected_action' => 'armory_login',
            'armory.recaptcha.expected_hostname' => 'armory.test',
            'armory.recaptcha.min_score' => 0.7,
        ]);
        Http::fake([
            'https://recaptcha.test/verify' => Http::response([
                'success' => true,
                'action' => 'armory_login',
                'score' => 0.9,
                'hostname' => 'armory.test',
            ]),
        ]);

        $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'wrong',
        ])->assertUnauthorized();

        $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'Admin@10RCDG!2025',
            'recaptcha_token' => 'valid-token',
        ])->assertOk()->assertJsonStructure(['challenge_token']);

        Http::assertSentCount(1);
    }

    public function test_recaptcha_fails_closed_for_mismatched_or_unavailable_verification(): void
    {
        config([
            'armory.failed_login_threshold' => 1,
            'armory.recaptcha.secret' => 'test-secret',
            'armory.recaptcha.verify_url' => 'https://recaptcha.test/verify',
            'armory.recaptcha.expected_action' => 'login',
        ]);
        $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'wrong',
        ])->assertUnauthorized();

        Http::fake([
            'https://recaptcha.test/verify' => Http::response([
                'success' => true,
                'action' => 'other_action',
                'score' => 1.0,
            ]),
        ]);
        $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'Admin@10RCDG!2025',
            'recaptcha_token' => 'mismatched-token',
        ])->assertStatus(429)->assertJson(['recaptcha_required' => true]);

        Http::fake([
            'https://recaptcha.test/verify' => Http::response([], 503),
        ]);
        $this->postJson('/api/v1/auth/login', [
            'username' => 'admin',
            'password' => 'Admin@10RCDG!2025',
            'recaptcha_token' => 'unavailable-token',
        ])->assertStatus(429)->assertJson(['recaptcha_required' => true]);
    }

    public function test_live_biometric_capture_requires_valid_challenge_bound_attestation(): void
    {
        $user = User::where('username', 'admin')->firstOrFail();
        $challenge = str_repeat('c', 64);
        $fingerprint = str_repeat('f', 32);
        $capturedAt = now()->toIso8601String();
        $secret = 'bridge-test-secret';
        config(['armory.biometric.bridge_hmac_secret' => $secret]);
        Cache::put("login-challenge:{$challenge}", [
            'user_id' => $user->user_id,
            'password_ok' => true,
            'totp_required' => true,
            'biometric_required' => true,
            'totp_ok' => true,
            'biometric_ok' => false,
            'expires_at' => now()->addMinutes(5)->timestamp,
        ], now()->addMinutes(5));

        $basePayload = [
            'challenge_token' => $challenge,
            'fingerprint' => $fingerprint,
            'source' => 'futronic_bridge',
            'captured_at' => $capturedAt,
        ];
        $this->postJson('/api/v1/auth/biometric/verify', $basePayload + [
            'capture_signature' => str_repeat('0', 64),
        ])->assertUnauthorized();

        $signaturePayload = implode('|', [
            $challenge,
            $user->username,
            $capturedAt,
            hash('sha256', $fingerprint),
        ]);
        $this->postJson('/api/v1/auth/biometric/verify', $basePayload + [
            'capture_signature' => hash_hmac('sha256', $signaturePayload, $secret),
        ])->assertOk()->assertJsonStructure(['token', 'user']);
    }
}
