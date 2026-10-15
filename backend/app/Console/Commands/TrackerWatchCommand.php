<?php

namespace App\Console\Commands;

use App\Services\TrackerWatchdog;
use Illuminate\Console\Command;

class TrackerWatchCommand extends Command
{
    protected $signature   = 'armory:tracker-watch';
    protected $description = 'Notify when an issued firearm\'s IoT tracker stops sending location updates.';

    public function handle(): int
    {
        $lost = TrackerWatchdog::sweep();
        $this->info("Trackers newly silent: {$lost}");
        return self::SUCCESS;
    }
}
