# Auto-enable required PHP extensions in php.ini
$targetIni = "C:\php\php.ini"

if (-not (Test-Path $targetIni)) {
    $phpDir = Split-Path (Get-Command php.exe -ErrorAction SilentlyContinue).Source
    if ($phpDir -and (Test-Path "$phpDir\php.ini")) {
        $targetIni = "$phpDir\php.ini"
    } elseif (Test-Path "C:\xampp\php\php.ini") {
        $targetIni = "C:\xampp\php\php.ini"
    }
}

if (-not (Test-Path $targetIni)) {
    Write-Host "[ERROR] Could not find php.ini at $targetIni" -ForegroundColor Red
    exit 1
}

Write-Host "Configuring $targetIni ..." -ForegroundColor Cyan

$content = Get-Content -Path $targetIni -Raw

# Uncomment extension_dir
$content = $content -replace ';extension_dir\s*=\s*"ext"', 'extension_dir = "ext"'
$content = $content -replace ';extension_dir\s*=\s*"[^\"]*ext"', 'extension_dir = "ext"'

# Uncomment extensions
$extensions = @('mbstring', 'pdo_mysql', 'mysqli', 'openssl', 'fileinfo', 'curl', 'gd', 'zip', 'bcmath')
foreach ($ext in $extensions) {
    $content = $content -replace ";extension\s*=\s*$ext", "extension=$ext"
}

# Comment out broken sockets if DLL is missing
$phpFolder = Split-Path $targetIni
if (-not (Test-Path "$phpFolder\ext\php_sockets.dll")) {
    $content = $content -replace '(?<!;)extension\s*=\s*sockets', ';extension=sockets'
}

Set-Content -Path $targetIni -Value $content -Encoding utf8

Write-Host "[OK] Successfully updated $targetIni!" -ForegroundColor Green
Write-Host ""
Write-Host "Extensions status:"
$testCode = "echo '  mbstring:  ' . (extension_loaded('mbstring') ? 'OK' : 'MISSING') . PHP_EOL;" +
            "echo '  pdo_mysql: ' . (extension_loaded('pdo_mysql') ? 'OK' : 'MISSING') . PHP_EOL;" +
            "echo '  openssl:   ' . (extension_loaded('openssl') ? 'OK' : 'MISSING') . PHP_EOL;"
php -r $testCode
