<#
    Builds a ready-to-run Wokwi project in iot/wokwi/.

    Produces:
      iot/wokwi/sketch.ino    single file with config.h inlined (paste into wokwi.com)
      iot/wokwi/diagram.json  copy of the circuit
      iot/wokwi/wokwi.toml    config for the Wokwi VS Code extension
      iot/wokwi/build/        compiled .bin/.elf, when arduino-cli is installed

    Two ways to use the output:

      A) wokwi.com  - paste sketch.ino and diagram.json into the browser editor.
                      Uses Wokwi's shared build servers, which can queue up.

      B) VS Code    - install the "Wokwi for VS Code" extension, open the
                      iot/wokwi folder, press F1 -> "Wokwi: Start Simulator".
                      Compiles locally, so no build queue, and the extension
                      bundles the Private IoT Gateway so the simulated ESP32 can
                      reach http://host.wokwi.internal:8000 directly - no ngrok.

    Everything in iot/wokwi/ is git-ignored: config.h is inlined, so the output
    contains your Wi-Fi password and the shared HMAC secret.

    Usage, from the repository root:
        powershell -NoProfile -ExecutionPolicy Bypass -File iot\tools\make_wokwi_sketch.ps1
#>

$ErrorActionPreference = 'Stop'

<#
    Write UTF-8 with no byte order mark.

    Windows PowerShell 5.1 writes a BOM for "-Encoding utf8", and Wokwi's TOML
    parser rejects it with: Unknown character "65279" at row 1, col 2.
    JSON parsers dislike it too, so every generated file goes through here.
#>
function Write-TextNoBom {
    param(
        [Parameter(Mandatory)][string] $Path,
        [Parameter(Mandatory)][AllowEmptyString()][string] $Text
    )
    $full = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path $Path))
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($full, $Text, $utf8NoBom)
}

$sketchDir = 'iot\firmware\armory_tracker'
$inoPath = Join-Path $sketchDir 'armory_tracker.ino'
$cfgPath = Join-Path $sketchDir 'config.h'
$diagramPath = Join-Path $sketchDir 'diagram.json'
$outDir = 'iot\wokwi'
$buildDir = Join-Path $outDir 'build'
$fqbn = 'esp32:esp32:esp32'

foreach ($p in @($inoPath, $cfgPath, $diagramPath)) {
    if (-not (Test-Path $p)) { throw "missing $p (copy config.example.h to config.h first)" }
}

New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# ---------- 1. single-file sketch with config.h inlined ----------
$ino = Get-Content $inoPath -Raw
$cfg = Get-Content $cfgPath -Raw
$cfg = [regex]::Replace($cfg, '(?m)^\s*#pragma once\s*$', '')

$banner = @"
/* ===========================================================================
 * GENERATED FILE - do not edit here.
 *
 * Built from:
 *   iot/firmware/armory_tracker/armory_tracker.ino
 *   iot/firmware/armory_tracker/config.h
 *
 * Regenerate after changing either one:
 *   powershell -NoProfile -ExecutionPolicy Bypass -File iot\tools\make_wokwi_sketch.ps1
 *
 * Paste this whole file into the sketch.ino tab at wokwi.com, together with
 * diagram.json, then add TinyGPSPlus, ArduinoJson and LiquidCrystal I2C from
 * the Library Manager tab.
 *
 * Holds your Wi-Fi password and shared secret, so it is git-ignored.
 * =========================================================================== */

"@

$inlined = @"
/* ---------------- begin inlined config.h ---------------- */
$cfg
/* ----------------- end inlined config.h ----------------- */
"@

if ($ino -notmatch '(?m)^\s*#include\s+"config\.h"\s*$') {
    throw 'could not find #include "config.h" in the sketch'
}
$merged = $banner + [regex]::Replace($ino, '(?m)^\s*#include\s+"config\.h"\s*$', { param($m) $inlined }, 1)
$sketchOut = Join-Path $outDir 'sketch.ino'
Write-TextNoBom -Path $sketchOut -Text $merged
Write-Output "wrote $sketchOut ($((($merged -split "`n").Count)) lines)"

# ---------- 2. diagram ----------
$diagramOut = Join-Path $outDir 'diagram.json'
Write-TextNoBom -Path $diagramOut -Text (Get-Content $diagramPath -Raw)
Write-Output "wrote $diagramOut"

# ---------- 3. compile locally, if the toolchain is available ----------
$cli = Get-Command arduino-cli -ErrorAction SilentlyContinue
$firmware = $null
$elf = $null

if (-not $cli) {
    Write-Output 'arduino-cli not found - skipping local build (browser route still works)'
} else {
    # arduino-cli needs the folder name to match the sketch name.
    $stage = Join-Path $env:TEMP 'armory_wokwi_stage\sketch'
    Remove-Item (Split-Path $stage -Parent) -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    Copy-Item $sketchOut (Join-Path $stage 'sketch.ino') -Force

    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
    $log = (arduino-cli compile --fqbn $fqbn --output-dir $buildDir $stage 2>&1 | Out-String)

    if ($LASTEXITCODE -ne 0) {
        Write-Output 'LOCAL BUILD FAILED:'
        ($log -split "`n") | Select-String ': error:' | Select-Object -First 8 | ForEach-Object { Write-Output "   $_" }
        throw 'compilation failed - fix the errors above'
    }

    $firmware = (Get-ChildItem $buildDir -Filter '*.ino.bin' | Select-Object -First 1)
    $elf = (Get-ChildItem $buildDir -Filter '*.ino.elf' | Select-Object -First 1)
    $usage = [regex]::Match($log, 'Sketch uses \d+ bytes \(\d+%\)').Value
    Write-Output "local build OK - $usage"
    Remove-Item (Split-Path $stage -Parent) -Recurse -Force -ErrorAction SilentlyContinue
}

# ---------- 4. wokwi.toml for the VS Code extension ----------
$fwRel = if ($firmware) { 'build/' + $firmware.Name } else { 'build/sketch.ino.bin' }
$elfRel = if ($elf) { 'build/' + $elf.Name } else { 'build/sketch.ino.elf' }

$toml = @"
# Generated by iot/tools/make_wokwi_sketch.ps1
# Open THIS folder (iot/wokwi) in VS Code, then press F1 -> "Wokwi: Start Simulator".
# Requires the "Wokwi for VS Code" extension and a free licence
# (F1 -> "Wokwi: Request a new License").
#
# Local simulation skips Wokwi's shared build queue, and the extension bundles the
# Private IoT Gateway, so the simulated ESP32 can reach services on this machine
# through the hostname host.wokwi.internal - no ngrok tunnel required.
#
# For that route set these in iot/firmware/armory_tracker/config.h, then rerun
# this script:
#   #define API_URL "http://host.wokwi.internal:8000/api/v1/gps/ingest"
#   #define USE_HTTPS 0

[wokwi]
version = 1
firmware = '$fwRel'
elf = '$elfRel'
"@

Write-TextNoBom -Path (Join-Path $outDir 'wokwi.toml') -Text $toml
Write-Output "wrote $outDir\wokwi.toml -> $fwRel"

# ---------- 5. guard against a byte order mark sneaking back in ----------
foreach ($name in @('wokwi.toml', 'diagram.json', 'sketch.ino')) {
    $f = [System.IO.Path]::GetFullPath((Join-Path (Get-Location).Path (Join-Path $outDir $name)))
    $head = [System.IO.File]::ReadAllBytes($f)[0..2]
    if ($head[0] -eq 0xEF -and $head[1] -eq 0xBB -and $head[2] -eq 0xBF) {
        throw "$name still starts with a UTF-8 BOM; Wokwi will reject it"
    }
}
Write-Output 'BOM check passed on wokwi.toml, diagram.json, sketch.ino'
Write-Output 'reminder: iot/wokwi/ is git-ignored because it contains secrets'
