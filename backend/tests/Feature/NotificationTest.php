<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class NotificationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed();
    }

    private function actAsAdmin(): User
    {
        $user = User::where('username', 'admin')->first();
        Sanctum::actingAs($user, ['Administrator']);
        return $user;
    }

    public function test_list_notifications(): void
    {
        $user = $this->actAsAdmin();
        Notification::create([
            'user_id'  => $user->user_id,
            'type'     => 'test',
            'severity' => 'info',
            'title'    => 'Test Notification',
            'message'  => 'This is a test.',
        ]);

        $response = $this->getJson('/api/v1/notifications');
        $response->assertOk();
        $this->assertGreaterThanOrEqual(1, count($response->json('data')));
    }

    public function test_unread_notifications(): void
    {
        $user = $this->actAsAdmin();
        Notification::create([
            'user_id'  => $user->user_id,
            'type'     => 'test',
            'severity' => 'warning',
            'title'    => 'Unread Alert',
            'message'  => 'Check this.',
        ]);

        $response = $this->getJson('/api/v1/notifications/unread');
        $response->assertOk()->assertJsonStructure(['items', 'count']);
        $this->assertGreaterThanOrEqual(1, $response->json('count'));
    }

    public function test_mark_all_read(): void
    {
        $user = $this->actAsAdmin();
        Notification::create([
            'user_id'  => $user->user_id,
            'type'     => 'test',
            'severity' => 'info',
            'title'    => 'Read Me',
            'message'  => 'Please.',
        ]);

        $this->postJson('/api/v1/notifications/mark-all-read')->assertOk();

        $response = $this->getJson('/api/v1/notifications/unread');
        $this->assertEquals(0, $response->json('count'));
    }
}
