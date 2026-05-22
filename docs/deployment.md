# Deployment Guide

## Target Environment

| Layer | Recommendation |
|---|---|
| OS | Ubuntu 22.04 LTS (server) · Windows 11 (client browsers) |
| Web | Caddy 2 (auto-TLS) **or** Nginx 1.24+ + certbot |
| PHP | 8.2+ FPM |
| DB | MariaDB 10.6+ (preferred) or MySQL 8 |
| Node | 20.x LTS |
| Network | LAN / camp WAN, optional VPN to remote sites |
| Firewall | Allow 443/tcp inbound; deny everything else |

## 1. Provision MariaDB

```bash
sudo apt install -y mariadb-server
sudo mysql_secure_installation

sudo mariadb -e "
  CREATE DATABASE armorydb CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
  CREATE USER 'armory_admin'@'localhost' IDENTIFIED BY 'CHANGE_ME_strong_password';
  GRANT ALL ON armorydb.* TO 'armory_admin'@'localhost';
  FLUSH PRIVILEGES;
"
```

In `backend/.env` set:

```env
DB_CONNECTION=mariadb
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=armorydb
DB_USERNAME=armory_admin
DB_PASSWORD=CHANGE_ME_strong_password
```

## 2. Deploy the Laravel API

```bash
cd /opt
git clone https://example.org/realtime-gps.git
cd realtime-gps/backend
composer install --no-dev --optimize-autoloader
cp .env.example .env && nano .env       # set APP_ENV=production, APP_DEBUG=false, IOT_HMAC_SECRET, etc.
php artisan key:generate
php artisan migrate --force --seed
php artisan config:cache
php artisan route:cache
php artisan view:cache
sudo chown -R www-data:www-data storage bootstrap/cache
```

### Caddyfile

```
armory.10rcdg.local {
    encode gzip zstd
    root * /opt/realtime-gps/backend/public

    php_fastcgi unix//run/php/php8.2-fpm.sock
    file_server

    @api path /api/*
    handle @api {
        header X-Content-Type-Options nosniff
        header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
    }
}
```

### Scheduler (cron)

```cron
* * * * * cd /opt/realtime-gps/backend && php artisan schedule:run >> /dev/null 2>&1
```

Add this to `routes/console.php` (or a service provider) to run the sweep every 5 minutes:

```php
Schedule::call(fn () => app(TransactionController::class)->sweepOverdue(request()))
    ->everyFiveMinutes();
```

## 3. Deploy the Next.js Frontend

```bash
cd /opt/realtime-gps/frontend
cp .env.local.example .env.local && nano .env.local  # set NEXT_PUBLIC_API_URL=https://armory.10rcdg.local/api/v1
npm ci --legacy-peer-deps
npm run build
pm2 start "npm run start" --name armorydb-frontend
pm2 save
```

Or have Caddy reverse-proxy `armory.10rcdg.local` to `127.0.0.1:3000`.

## 4. Deploy the IoT Devices

1. Edit `iot/firmware/firmware.ino` constants (Wi-Fi, API URL, `HMAC_SECRET`, `EQUIPMENT_ID`).
2. Flash via Arduino IDE 2.x (board: ESP32-WROOM-32).
3. Mount on firearm housing or carrier; verify GPS lock and HTTPS POST in serial monitor.

## 5. Backups

Daily encrypted dump:

```bash
0 2 * * * /usr/bin/mysqldump --single-transaction armorydb \
  | /usr/bin/openssl enc -aes-256-cbc -salt -pbkdf2 -pass file:/etc/armory/backup.key \
  > /var/backups/armorydb-$(date +\%F).sql.enc
```

Off-site: rsync to remote host or push to encrypted S3 bucket.

## 6. Health Checks

| Path | Purpose |
|---|---|
| `GET /up` | Laravel built-in health (200) |
| `GET /api/health` | ArmoryDB versioned health |

## 7. Hardening

- TLS 1.3 only · disable TLS ≤ 1.1
- Disable Laravel debug: `APP_DEBUG=false`
- Set `SESSION_SECURE_COOKIE=true` and `SESSION_DOMAIN=.10rcdg.local`
- Rotate `IOT_HMAC_SECRET` quarterly
- Enable `audit_logs` DB trigger: `BEFORE UPDATE/DELETE … SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='Audit logs are immutable.'`
- Apply OS updates weekly
- Restrict SSH to keys + bastion host
