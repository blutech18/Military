<?php
require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$user = App\Models\User::where('username', 'admin')->first();
$token = $user->createToken('puppeteer')->plainTextToken;
$userData = [
    'user_id' => $user->user_id,
    'username' => $user->username,
    'first_name' => $user->first_name,
    'last_name' => $user->last_name,
    'role' => $user->role->role_name,
    'clearance' => $user->security_clearance
];

echo $token . "\n";
echo json_encode($userData) . "\n";
