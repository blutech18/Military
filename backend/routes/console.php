<?php

use Illuminate\Support\Facades\Schedule;

Schedule::command('armory:sweep-overdue')->everyFiveMinutes()->name('sweep-overdue');
Schedule::command('armory:maintenance-due')->dailyAt('07:00')->name('maintenance-due');
