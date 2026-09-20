<?php

namespace App\Console\Commands;

use App\Mail\PasswordResetCode;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Mail;

class TestMailCommand extends Command
{
    protected $signature = 'armory:test-mail {email? : Recipient email address to send a test message to}';
    protected $description = 'Verify and test the outgoing SMTP configuration (e.g. Gmail SMTP)';

    public function handle(): int
    {
        $this->info('--- ArmoryDB SMTP Diagnostic & Test ---');

        $mailer = config('mail.default');
        $host = config('mail.mailers.smtp.host');
        $port = config('mail.mailers.smtp.port');
        $encryption = config('mail.mailers.smtp.encryption');
        $username = config('mail.mailers.smtp.username');
        $from = config('mail.from.address');

        $this->table(
            ['Setting', 'Configured Value'],
            [
                ['Mailer', $mailer],
                ['SMTP Host', $host],
                ['Port', $port],
                ['Encryption', $encryption ?: '(none)'],
                ['Username', $username ?: '(empty)'],
                ['Password', config('mail.mailers.smtp.password') ? '******** (configured)' : '(empty)'],
                ['From Address', $from ?: '(empty)'],
            ]
        );

        if ($mailer !== 'smtp') {
            $this->warn("Current mailer is set to '{$mailer}', not 'smtp'. Set MAIL_MAILER=smtp in .env to use real Gmail delivery.");
        }

        if (empty($username) || empty(config('mail.mailers.smtp.password'))) {
            $this->error('MAIL_USERNAME or MAIL_PASSWORD is not configured in .env.');
            $this->line('Please add your Gmail address and 16-character Google App Password in backend/.env:');
            $this->line('  MAIL_USERNAME=your.email@gmail.com');
            $this->line('  MAIL_PASSWORD=your_16_char_app_password');
            return Command::FAILURE;
        }

        $recipient = $this->argument('email') ?: $username;

        $this->info("Attempting to dispatch test email to: {$recipient}...");

        try {
            $mockUser = User::first() ?? new User([
                'first_name' => 'Armory',
                'last_name' => 'Operator',
                'username' => 'operator',
                'email' => $recipient,
                'security_clearance' => 2,
            ]);

            Mail::to($recipient)->send(
                new PasswordResetCode($mockUser, (string) random_int(100000, 999999), '127.0.0.1', 15)
            );

            $this->info("SUCCESS: Test email successfully transmitted to {$recipient} via {$host}:{$port}!");
            return Command::SUCCESS;
        } catch (\Throwable $e) {
            $this->error("FAILED: Could not send email via SMTP.");
            $this->error("Error: " . $e->getMessage());
            $this->line('');
            $this->line('Tips for Gmail SMTP:');
            $this->line(' 1. Ensure 2-Step Verification is active on your Google Account.');
            $this->line(' 2. Use a 16-character App Password (not your personal Google account password).');
            $this->line('    Generate one at: https://myaccount.google.com/apppasswords');
            $this->line(' 3. Check for firewalls blocking outbound port 587.');
            return Command::FAILURE;
        }
    }
}
