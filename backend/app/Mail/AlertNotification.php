<?php

namespace App\Mail;

use App\Models\Notification;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class AlertNotification extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public Notification $notification,
        public string $recipientName,
    ) {}

    public function envelope(): Envelope
    {
        $prefix = match ($this->notification->severity) {
            'critical' => '🚨 CRITICAL',
            'warning'  => '⚠️ WARNING',
            default    => 'ℹ️ INFO',
        };

        return new Envelope(
            subject: "[ArmoryDB] {$prefix}: {$this->notification->title}",
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.alert-notification',
        );
    }
}
