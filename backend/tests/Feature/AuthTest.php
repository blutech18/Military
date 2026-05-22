<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
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
}
