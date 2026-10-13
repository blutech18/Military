# ArmoryDB tracker setup.
#
# Window: type the hotspot's Wi-Fi name and password; this laptop's IP address and the ESP32's COM port
# are detected automatically. "Save to tracker" writes them into config.h and flashes the ESP32 with
# "Erase All Flash" (which also clears any Wi-Fi / address saved earlier from the phone setup page, so
# the board uses config.h), then checks that the tracker joins the Wi-Fi.
# When the window closes, the same terminal shows the tracker's live status until Ctrl+C.
#
# Usage (from the project folder):
#   iot\setup-tracker.bat            window, then live status
#   iot\setup-tracker.bat monitor    live status only
#   iot\setup-tracker.bat detect     print what would be detected, no window
param([string]$Action = 'window')

$ErrorActionPreference = 'Stop'

$IotDir     = Split-Path -Parent $PSScriptRoot
$RepoRoot   = Split-Path -Parent $IotDir
$SketchDir  = Join-Path $IotDir 'firmware\armory_tracker'
$ConfigH    = Join-Path $SketchDir 'config.h'
$ExampleH   = Join-Path $SketchDir 'config.example.h'
$BackendEnv = Join-Path $RepoRoot 'backend\.env'
$Fqbn       = 'esp32:esp32:esp32'
$ApiPort    = 8000
$OutLog     = Join-Path $env:TEMP 'armory-tracker-flash.out.log'
$ErrLog     = Join-Path $env:TEMP 'armory-tracker-flash.err.log'

# Non-ASCII glyphs as code points: Windows PowerShell reads a BOM-less script as ANSI.
$G = @{
    Check = [string][char]0x2713; Cross = [string][char]0x2715; Dot = [string][char]0x25CF
    Down  = [string][char]0x25BE; Up    = [string][char]0x25B4; Ellipsis = [string][char]0x2026
}

# ================================================================ detection

function Find-ArduinoCli {
    $cmd = Get-Command arduino-cli -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $local = Join-Path $env:LOCALAPPDATA 'arduino-cli\arduino-cli.exe'
    if (Test-Path $local) { return $local }
    return $null
}

function Get-EnvValue([string]$Key) {
    if (-not (Test-Path $BackendEnv)) { return '' }
    $m = Select-String -Path $BackendEnv -Pattern "^$Key=(.*)$" | Select-Object -First 1
    if ($m) { return $m.Matches[0].Groups[1].Value.Trim().Trim('"') }
    return ''
}

# The Wi-Fi this laptop is on right now, and its band.
function Get-LaptopWifi {
    $out = netsh wlan show interfaces 2>$null | Out-String
    $ssid = ''; $band = ''
    if ($out -match '(?m)^\s+SSID\s+:\s(.+)$') { $ssid = $Matches[1].Trim() }
    if ($out -match '(?m)^\s+Band\s+:\s(.+)$') { $band = $Matches[1].Trim() }
    [pscustomobject]@{ Ssid = $ssid; Band = $band }
}

# Networks in range: name -> $true when it is visible on 2.4 GHz (the only band the ESP32 can use).
function Get-VisibleNetworks {
    $result = [ordered]@{}
    $current = $null
    foreach ($line in (netsh wlan show networks mode=bssid 2>$null)) {
        if ($line -match '^SSID \d+ : (.*)$') {
            $current = $Matches[1].Trim()
            if ($current -and -not $result.Contains($current)) { $result[$current] = $false }
        } elseif ($current -and $line -match '^\s+Band\s+:\s+2\.4 GHz') {
            $result[$current] = $true
        }
    }
    return $result
}

# This laptop's IPv4 address on the network that has a gateway (the hotspot), Wi-Fi preferred.
function Get-LaptopIp {
    $configs = @(Get-NetIPConfiguration -ErrorAction SilentlyContinue |
        Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' })
    $wifi = $configs | Where-Object {
        $_.NetAdapter.PhysicalMediaType -match '802\.11' -or $_.InterfaceAlias -match 'Wi-?Fi|WLAN|Wireless'
    } | Select-Object -First 1
    $pick = if ($wifi) { $wifi } else { $configs | Select-Object -First 1 }
    if ($pick) { return ($pick.IPv4Address | Select-Object -First 1).IPAddress }
    return ''
}

# USB-serial ports, the ESP32's usual chips (CH340, CP210x) first.
function Get-TrackerPorts {
    @(Get-PnpDevice -PresentOnly -Class Ports -ErrorAction SilentlyContinue | ForEach-Object {
        if ($_.FriendlyName -match '\((COM\d+)\)') {
            [pscustomobject]@{
                Port   = $Matches[1]
                Label  = $_.FriendlyName
                Likely = [bool]($_.FriendlyName -match 'CH34|CP210|USB')
            }
        }
    } | Sort-Object @{ Expression = { -not $_.Likely } }, Port)
}

# Firearms whose Active/Overdue transaction has GPS tracking on: the ones that accept positions.
function Get-TrackableFirearms {
    $mysql = 'C:\xampp\mysql\bin\mysql.exe'
    if (-not (Test-Path $mysql)) { return @() }
    $db = Get-EnvValue 'DB_DATABASE'; if (-not $db) { $db = 'armorydb' }
    $user = Get-EnvValue 'DB_USERNAME'; if (-not $user) { $user = 'root' }
    $env:MYSQL_PWD = Get-EnvValue 'DB_PASSWORD'
    $query = "SELECT f.equipment_id, f.serial_number, f.model, t.status FROM firearm_equipment f " +
             "JOIN transactions t ON t.equipment_id = f.equipment_id " +
             "WHERE f.deleted_at IS NULL AND t.status IN ('Active','Overdue') AND t.gps_tracking_enabled = 1 " +
             "ORDER BY f.equipment_id"
    try {
        $rows = & $mysql --host=127.0.0.1 "--user=$user" --connect-timeout=2 -N -B -e $query $db 2>$null
    } catch {
        $rows = @()
    } finally {
        Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
    }
    @($rows | Where-Object { $_ } | ForEach-Object {
        $c = $_ -split "`t"
        "{0} - {1} {2} ({3})" -f $c[0], $c[1], $c[2], $c[3]
    })
}

function Get-ConfigDefine([string]$Key) {
    $file = if (Test-Path $ConfigH) { $ConfigH } else { $ExampleH }
    $m = Select-String -Path $file -Pattern "^#define\s+$Key\s+(.*)$" | Select-Object -First 1
    if (-not $m) { return '' }
    $value = $m.Matches[0].Groups[1].Value.Trim()
    if ($value -match '^"(.*)"') { return $Matches[1] }
    return ($value -split '\s+')[0]
}

function Test-Backend([string]$Ip) {
    if (-not $Ip) { return $false }
    try {
        $r = Invoke-WebRequest "http://${Ip}:$ApiPort/api/health" -UseBasicParsing -TimeoutSec 3
        return $r.StatusCode -eq 200
    } catch { return $false }
}

# ================================================================ config.h

function ConvertTo-CString([string]$Value) {
    return '"' + ($Value -replace '\\', '\\' -replace '"', '\"') + '"'
}

function Set-Define([string]$Text, [string]$Key, [string]$Value) {
    $pattern = "(?m)^#define\s+$Key\b.*$"
    if ($Text -notmatch $pattern) { throw "#define $Key was not found in config.h" }
    $line = "#define $Key $Value"
    return [regex]::Replace($Text, $pattern, [System.Text.RegularExpressions.MatchEvaluator] { param($m) $line })
}

function Write-TrackerConfig([string]$Ssid, [string]$Password, [string]$Ip, [int]$EquipmentId) {
    if (-not (Test-Path $ConfigH)) { Copy-Item $ExampleH $ConfigH }
    $text = [IO.File]::ReadAllText($ConfigH)
    $text = Set-Define $text 'WIFI_SSID' (ConvertTo-CString $Ssid)
    $text = Set-Define $text 'WIFI_PASS' (ConvertTo-CString $Password)
    $text = Set-Define $text 'API_URL' (ConvertTo-CString "http://${Ip}:$ApiPort/api/v1/gps/ingest")
    $text = Set-Define $text 'USE_HTTPS' '0'
    $text = Set-Define $text 'EQUIPMENT_ID' "$EquipmentId"
    # Keep the signing secret identical to the backend's, or every position is rejected (401).
    $secret = Get-EnvValue 'IOT_HMAC_SECRET'
    if ($secret) { $text = Set-Define $text 'HMAC_SECRET' (ConvertTo-CString $secret) }
    [IO.File]::WriteAllText($ConfigH, $text, (New-Object Text.UTF8Encoding $false))
}

# ================================================================ live status in the terminal

function Get-LineColor([string]$Line) {
    if ($Line -match 'failed|HTTP [45]\d\d|transport error|rejected|Guru|panic|abort|Backtrace|not found') { return 'Red' }
    if ($Line -match 'HTTP 2\d\d|\[wifi\] connected|\[gps\] -?\d+\.\d+') { return 'Green' }
    if ($Line -match 'no fix yet|fix lost|fix too weak|waiting for a GPS fix|reconnecting|link down') { return 'Yellow' }
    if ($Line -match '\[setup\]|\*wm:') { return 'Cyan' }
    return 'Gray'
}

function Start-ConsoleMonitor([string]$Port) {
    try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch { }
    $ports = Get-TrackerPorts
    if (-not $Port -or -not ($ports | Where-Object Port -eq $Port)) { $Port = ($ports | Select-Object -First 1).Port }
    if (-not $Port) {
        Write-Host ''
        Write-Host 'No ESP32 is plugged in by USB, so there is no live status to show.' -ForegroundColor Yellow
        Write-Host 'The tracker still runs on any power source. To watch it: plug it in, then run  iot\setup-tracker.bat monitor'
        return
    }

    $sp = New-Object System.IO.Ports.SerialPort $Port, 115200, 'None', 8, 'One'
    $sp.Encoding = [Text.Encoding]::UTF8
    $sp.ReadTimeout = 500
    $sp.DtrEnable = $false
    $sp.RtsEnable = $false
    try {
        $sp.Open()
    } catch {
        Write-Host "Could not open ${Port}: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host 'Close any other monitor that uses this port (arduino-cli monitor, Arduino IDE), then try again.'
        return
    }

    Write-Host ''
    Write-Host "  Live tracker status on $Port" -ForegroundColor Cyan
    Write-Host '  green = connected / position sent    yellow = waiting for GPS    red = problem' -ForegroundColor DarkGray
    Write-Host '  Press Ctrl+C to stop watching. The tracker keeps running.' -ForegroundColor DarkGray
    Write-Host ''
    try {
        while ($true) {
            try {
                $line = $sp.ReadLine().TrimEnd()
            } catch [System.TimeoutException] {
                continue
            } catch {
                Write-Host "Tracker disconnected from $Port." -ForegroundColor Yellow
                break
            }
            if (-not $line.Trim()) { continue }
            Write-Host ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $line) -ForegroundColor (Get-LineColor $line)
        }
    } finally {
        if ($sp.IsOpen) { $sp.Close() }
    }
}

# ================================================================ non-window actions

switch ($Action.ToLower()) {
    'detect' {
        $wifi = Get-LaptopWifi
        $ip = Get-LaptopIp
        "arduino-cli : " + $(if (Find-ArduinoCli) { Find-ArduinoCli } else { 'NOT FOUND' })
        "laptop Wi-Fi: '$($wifi.Ssid)' ($($wifi.Band))"
        "laptop IP   : $ip"
        "backend     : " + $(if (Test-Backend $ip) { "reachable at http://${ip}:$ApiPort" } else { 'not reachable' })
        "ESP32 ports : " + ((Get-TrackerPorts | ForEach-Object Label) -join ', ')
        "firearms    : " + ((Get-TrackableFirearms) -join ' | ')
        "networks    : " + (((Get-VisibleNetworks).GetEnumerator() | ForEach-Object {
            $_.Key + $(if ($_.Value) { '' } else { ' (5 GHz only)' }) }) -join ', ')
        "config.h    : " + $(if (Test-Path $ConfigH) { "present, EQUIPMENT_ID=$(Get-ConfigDefine 'EQUIPMENT_ID')" } else { 'missing (created from config.example.h on save)' })
        return
    }
    'monitor' {
        Start-ConsoleMonitor ''
        return
    }
}

# ================================================================ window: look and feel

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
try {
    Add-Type -Namespace ArmoryNative -Name Dpi -MemberDefinition '[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();'
    [void][ArmoryNative.Dpi]::SetProcessDPIAware()
} catch { }
# Windows 10/11 dark title bar (ignored on older Windows).
try {
    Add-Type -Namespace ArmoryNative -Name Theme -MemberDefinition @'
[DllImport("uxtheme.dll", CharSet = CharSet.Unicode)] public static extern int SetWindowTheme(IntPtr hWnd, string subAppName, string subIdList);
[DllImport("dwmapi.dll")] public static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);
[DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);
'@
} catch { }
[System.Windows.Forms.Application]::EnableVisualStyles()
# Errors inside button/timer handlers go to Report-UiError (below) instead of the Windows crash dialog.
# Must be set before the first window is created.
[System.Windows.Forms.Application]::SetUnhandledExceptionMode([System.Windows.Forms.UnhandledExceptionMode]::CatchException)

$gfx = [System.Drawing.Graphics]::FromHwnd([IntPtr]::Zero)
$script:Scale = $gfx.DpiX / 96.0
$gfx.Dispose()
function Px([double]$Value) { return [int][Math]::Round($Value * $script:Scale) }
function Pad([double]$l, [double]$t, [double]$r, [double]$b) { New-Object System.Windows.Forms.Padding((Px $l), (Px $t), (Px $r), (Px $b)) }
function Col([string]$Hex) { [System.Drawing.ColorTranslator]::FromHtml($Hex) }

# ArmoryDB palette (same as the tracker's phone setup page).
$C = @{
    Bg = '#14171c'; Card = '#1c252c'; Input = '#11161b'; Line = '#2e3a44'; Button = '#26323b'; ButtonHover = '#30404b'
    Accent = '#75803a'; AccentHover = '#8a9646'; Label = '#aeb771'; Text = '#e2e7e9'; Title = '#f5f6ee'
    Muted = '#94a4ab'; Dim = '#677a83'; Ok = '#7fd19b'; Warn = '#f5c27a'; Err = '#f08a7e'; Info = '#9cc3d5'
}
$FontUi    = New-Object System.Drawing.Font('Segoe UI', 9.5)
$FontField = New-Object System.Drawing.Font('Segoe UI', 9)
$FontSmall = New-Object System.Drawing.Font('Segoe UI', 8.25, [System.Drawing.FontStyle]::Bold)
$FontTitle = New-Object System.Drawing.Font('Segoe UI Semibold', 15)
$FontStep  = New-Object System.Drawing.Font('Segoe UI', 9.5)
$FontMono  = New-Object System.Drawing.Font('Consolas', 8.5)

$G = $G + @{ Circle = [string][char]0x25CB }

function New-Label([string]$Text, $Font = $FontUi, [string]$Color = $C.Text) {
    $l = New-Object System.Windows.Forms.Label
    $l.Text = $Text
    $l.Font = $Font
    $l.ForeColor = Col $Color
    $l.AutoSize = $true
    $l.Margin = Pad 0 0 0 0
    return $l
}

function New-Button([string]$Text, [bool]$Primary = $false) {
    $b = New-Object System.Windows.Forms.Button
    $b.Text = $Text
    $b.FlatStyle = 'Flat'
    $b.AutoSize = $true
    $b.AutoSizeMode = 'GrowAndShrink'
    $b.Cursor = [System.Windows.Forms.Cursors]::Hand
    $b.ForeColor = Col $C.Title
    $b.UseVisualStyleBackColor = $false
    $b.Margin = Pad 8 0 0 0
    if ($Primary) {
        $b.Font = New-Object System.Drawing.Font('Segoe UI Semibold', 10)
        $b.Padding = Pad 20 7 20 7
    } else {
        $b.Font = $FontField
        $b.Padding = Pad 10 1 10 1
    }
    $b.MinimumSize = New-Object System.Drawing.Size((Px 100), 0)
    Set-ButtonLook $b $Primary $true
    return $b
}

# Buttons keep their colours when locked (a disabled flat button is unreadable on a dark background).
function Set-ButtonLook($Button, [bool]$Primary, [bool]$Active) {
    if ($Primary -and $Active) {
        $Button.BackColor = Col $C.Accent; $Button.ForeColor = Col $C.Title
        $Button.FlatAppearance.BorderColor = Col $C.AccentHover; $Button.FlatAppearance.MouseOverBackColor = Col $C.AccentHover
    } elseif ($Primary) {
        $Button.BackColor = Col $C.Button; $Button.ForeColor = Col $C.Muted
        $Button.FlatAppearance.BorderColor = Col $C.Line; $Button.FlatAppearance.MouseOverBackColor = Col $C.Button
    } else {
        $Button.BackColor = Col $C.Button; $Button.ForeColor = Col $(if ($Active) { $C.Title } else { $C.Dim })
        $Button.FlatAppearance.BorderColor = Col $C.Line
        $Button.FlatAppearance.MouseOverBackColor = Col $(if ($Active) { $C.ButtonHover } else { $C.Button })
    }
    $Button.Cursor = $(if ($Active) { [System.Windows.Forms.Cursors]::Hand } else { [System.Windows.Forms.Cursors]::Default })
}

function Set-InputStyle($Control) {
    $Control.BackColor = Col $C.Input
    $Control.ForeColor = Col $C.Text
    $Control.Font = $FontUi
    $Control.Dock = 'Fill'
    $Control.Margin = Pad 0 0 0 0
    if ($Control -is [System.Windows.Forms.TextBox]) { $Control.BorderStyle = 'FixedSingle' }
    if ($Control -is [System.Windows.Forms.ComboBox]) {
        $Control.FlatStyle = 'Flat'
        try { [void][ArmoryNative.Theme]::SetWindowTheme($Control.Handle, 'DarkMode_CFD', $null) } catch { }
    }
}

# Text set in code is shown highlighted in an editable combo box; clear that.
function Clear-ComboHighlight($Combo) { if (-not $Combo.Focused) { $Combo.SelectionStart = $Combo.Text.Length; $Combo.SelectionLength = 0 } }

# Labels that wrap with their column width.
$script:wrapLabels = New-Object System.Collections.ArrayList
function Register-Wrap($Label) { [void]$script:wrapLabels.Add($Label); return $Label }

function New-Stack([int]$Columns = 1) {
    $t = New-Object System.Windows.Forms.TableLayoutPanel
    $t.ColumnCount = $Columns
    $t.AutoSize = $true
    $t.AutoSizeMode = 'GrowAndShrink'
    $t.Dock = 'Fill'
    $t.Margin = Pad 0 0 0 0
    $t.Padding = Pad 0 0 0 0
    return $t
}
function Add-Row($Stack, $Control, $Side = $null, [string]$Height = 'AutoSize') {
    $row = $Stack.RowCount
    $Stack.RowCount = $row + 1
    if ($Height -eq 'Fill') { [void]$Stack.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 100))) }
    else { [void]$Stack.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('AutoSize'))) }
    $Stack.Controls.Add($Control, 0, $row)
    if ($Side) { $Stack.Controls.Add($Side, 1, $row) }
    elseif ($Stack.ColumnCount -gt 1) { $Stack.SetColumnSpan($Control, $Stack.ColumnCount) }
}

# A card: small uppercase title, then rows of [field (fills)] [side control (auto)].
function New-Card([string]$Title, [int]$BottomGap = 10) {
    $card = New-Stack 2
    $card.BackColor = Col $C.Card
    $card.Padding = Pad 16 12 16 14
    $card.Margin = Pad 0 0 0 $BottomGap
    [void]$card.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 100)))
    [void]$card.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('AutoSize')))
    $head = New-Label $Title.ToUpper() $FontSmall $C.Label
    $head.Margin = Pad 0 0 0 2
    Add-Row $card $head
    return $card
}

function New-FieldLabel([string]$Text) {
    $l = New-Label $Text $FontField $C.Muted
    $l.Margin = Pad 0 8 0 4
    return $l
}

function New-Hint {
    $l = Register-Wrap (New-Label '' $FontField $C.Muted)
    $l.Margin = Pad 0 6 0 0
    $l.Visible = $false
    return $l
}

$HintStyles = @{ ok = @($C.Ok, $G.Check); warn = @($C.Warn, '!'); err = @($C.Err, $G.Cross); info = @($C.Info, $G.Dot) }
function Set-Hint($Label, [string]$Kind, [string]$Text) {
    if (-not $Text) { $Label.Visible = $false; return }
    $style = $HintStyles[$Kind]
    $Label.ForeColor = Col $style[0]
    $Label.Text = "$($style[1])  $Text"
    $Label.Visible = $true
}

# ================================================================ window: layout

$form = New-Object System.Windows.Forms.Form
$form.Text = 'ArmoryDB - Tracker setup'
$form.BackColor = Col $C.Bg
$form.ForeColor = Col $C.Text
$form.Font = $FontUi
$form.StartPosition = 'CenterScreen'
$form.SizeGripStyle = 'Hide'
$form.Padding = Pad 24 18 24 18
$workArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$form.ClientSize = New-Object System.Drawing.Size([Math]::Min((Px 1040), $workArea.Width - (Px 40)), (Px 640))
$form.Add_HandleCreated({ try { $on = 1; [void][ArmoryNative.Theme]::DwmSetWindowAttribute($form.Handle, 20, [ref]$on, 4) } catch { } })

# Two columns: setup on the left, activity on the right.
$root = New-Object System.Windows.Forms.TableLayoutPanel
$root.Dock = 'Fill'
$root.ColumnCount = 2
$root.RowCount = 1
[void]$root.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 55)))
[void]$root.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 45)))
[void]$root.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 100)))
$form.Controls.Add($root)

$left = New-Stack 1
$left.AutoSize = $false
$left.Margin = Pad 0 0 12 0
[void]$left.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 100)))
$right = New-Stack 1
$right.AutoSize = $false
$right.Margin = Pad 12 0 0 0
[void]$right.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 100)))
$root.Controls.Add($left, 0, 0)
$root.Controls.Add($right, 1, 0)

# ---- left: header
$brand = New-Label ("{0}  ARMORYDB  {1}  10RCDG" -f $G.Dot, $G.Dot) $FontSmall $C.AccentHover
$title = New-Label 'GPS tracker setup' $FontTitle $C.Title
$title.Margin = Pad 0 2 0 0
$subtitle = Register-Wrap (New-Label 'Connect the ESP32 tracker to the hotspot and this laptop. Plug it in by USB first.' $FontField $C.Muted)
$subtitle.Margin = Pad 0 2 0 14
Add-Row $left $brand
Add-Row $left $title
Add-Row $left $subtitle

# ---- left: 1 Hotspot
$card1 = New-Card '1   Hotspot'
Add-Row $card1 (New-FieldLabel 'Wi-Fi name (2.4 GHz)')
$cbSsid = New-Object System.Windows.Forms.ComboBox; Set-InputStyle $cbSsid; $cbSsid.DropDownStyle = 'DropDown'
$btnScan = New-Button 'Scan again'
Add-Row $card1 $cbSsid $btnScan
$hintSsid = New-Hint; Add-Row $card1 $hintSsid
Add-Row $card1 (New-FieldLabel 'Password')
$tbPass = New-Object System.Windows.Forms.TextBox; Set-InputStyle $tbPass; $tbPass.UseSystemPasswordChar = $true
$chkShow = New-Object System.Windows.Forms.CheckBox
$chkShow.Text = 'Show'; $chkShow.Font = $FontField; $chkShow.ForeColor = Col $C.Muted; $chkShow.AutoSize = $true; $chkShow.Margin = Pad 10 3 0 0
Add-Row $card1 $tbPass $chkShow
Add-Row $left $card1

# ---- left: 2 This laptop
$card2 = New-Card '2   This laptop'
Add-Row $card2 (New-FieldLabel 'IP address on the hotspot (detected automatically)')
$tbIp = New-Object System.Windows.Forms.TextBox; Set-InputStyle $tbIp
$btnIp = New-Button 'Detect again'
Add-Row $card2 $tbIp $btnIp
$hintLaptop = New-Hint; Add-Row $card2 $hintLaptop
$hintBackend = New-Hint; Add-Row $card2 $hintBackend
Add-Row $left $card2

# ---- left: 3 Tracker
$card3 = New-Card '3   Tracker' 0
Add-Row $card3 (New-FieldLabel 'Firearm (only firearms with GPS tracking on are listed)')
$cbFirearm = New-Object System.Windows.Forms.ComboBox; Set-InputStyle $cbFirearm; $cbFirearm.DropDownStyle = 'DropDown'
Add-Row $card3 $cbFirearm
$hintFirearm = New-Hint; Add-Row $card3 $hintFirearm
Add-Row $card3 (New-FieldLabel 'USB port')
$cbPort = New-Object System.Windows.Forms.ComboBox; Set-InputStyle $cbPort; $cbPort.DropDownStyle = 'DropDown'
$cbPort.Add_KeyPress({ param($src, $e) $e.Handled = $true })  # pick-only (DropDownList cannot be drawn dark)
$btnPorts = New-Button 'Refresh'
Add-Row $card3 $cbPort $btnPorts
$hintPort = New-Hint; Add-Row $card3 $hintPort
Add-Row $left $card3

# ---- left: spacer, then the action bar at the bottom
Add-Row $left (New-Object System.Windows.Forms.Panel -Property @{ Margin = (Pad 0 0 0 0); Height = 1 }) $null 'Fill'
$actions = New-Stack 2
$actions.Margin = Pad 0 14 0 0
[void]$actions.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 100)))
[void]$actions.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('AutoSize')))
$note = Register-Wrap (New-Label 'When done, close this window: live tracker status continues in the terminal.' $FontField $C.Dim)
$note.Anchor = 'Left'
$btnSave = New-Button 'Save to tracker' $true
$btnSave.Margin = Pad 12 0 0 0
$actions.Controls.Add($note, 0, 0)
$actions.Controls.Add($btnSave, 1, 0)
Add-Row $left $actions
$form.AcceptButton = $btnSave

# ---- right: activity card (fills the column height)
$activity = New-Stack 1
$activity.AutoSize = $false
$activity.BackColor = Col $C.Card
$activity.Padding = Pad 18 14 18 16
[void]$activity.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 100)))
$right.RowCount = 1
[void]$right.RowStyles.Add((New-Object System.Windows.Forms.RowStyle('Percent', 100)))
$right.Controls.Add($activity, 0, 0)

$actHead = New-Label 'ACTIVITY' $FontSmall $C.Label
$actHead.Margin = Pad 0 0 0 10
Add-Row $activity $actHead

# Steps
$script:steps = @()
foreach ($stepText in @('Write the settings', 'Build and upload the firmware', 'Check the Wi-Fi connection')) {
    $row = New-Stack 2
    $row.Margin = Pad 0 3 0 3
    [void]$row.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('AutoSize')))
    [void]$row.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 100)))
    $icon = New-Label $G.Circle $FontStep $C.Dim
    $icon.MinimumSize = New-Object System.Drawing.Size((Px 22), 0)
    $text = New-Label $stepText $FontStep $C.Muted
    $row.Controls.Add($icon, 0, 0)
    $row.Controls.Add($text, 1, 0)
    Add-Row $activity $row
    $script:steps += , @($icon, $text)
}

function Set-Step([int]$Index, [string]$State) {
    $icon = $script:steps[$Index][0]; $text = $script:steps[$Index][1]
    switch ($State) {
        'pending' { $icon.Text = $G.Circle; $icon.ForeColor = Col $C.Dim;         $text.ForeColor = Col $C.Muted }
        'running' { $icon.Text = $G.Dot;    $icon.ForeColor = Col $C.AccentHover; $text.ForeColor = Col $C.Title }
        'done'    { $icon.Text = $G.Check;  $icon.ForeColor = Col $C.Ok;          $text.ForeColor = Col $C.Text }
        'failed'  { $icon.Text = $G.Cross;  $icon.ForeColor = Col $C.Err;         $text.ForeColor = Col $C.Err }
    }
}
function Reset-Steps { 0..2 | ForEach-Object { Set-Step $_ 'pending' } }

# Progress: stage text + thin bar
$stageText = New-Label 'Ready. Fill in the left side, then press Save to tracker.' $FontField $C.Muted
$stageText.Margin = Pad 0 12 0 6
Register-Wrap $stageText | Out-Null
Add-Row $activity $stageText
$barOuter = New-Object System.Windows.Forms.Panel
$barOuter.Height = Px 4; $barOuter.Dock = 'Top'; $barOuter.BackColor = Col $C.Line; $barOuter.Margin = Pad 0 0 0 0
$barInner = New-Object System.Windows.Forms.Panel
$barInner.BackColor = Col $C.AccentHover; $barInner.Height = Px 4; $barInner.Width = 0; $barInner.Location = New-Object System.Drawing.Point(0, 0)
$barOuter.Controls.Add($barInner)
Add-Row $activity $barOuter

# Result banner
$banner = New-Stack 1
$banner.Padding = Pad 12 9 12 9
$banner.Margin = Pad 0 14 0 0
$banner.Visible = $false
[void]$banner.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 100)))
$bannerText = Register-Wrap (New-Label '' (New-Object System.Drawing.Font('Segoe UI Semibold', 9.5)) $C.Text)
$banner.Controls.Add($bannerText, 0, 0)
Add-Row $activity $banner

# Output: colour-coded, scrolls with the mouse wheel, no scrollbar drawn. "Watch live" (optional)
# streams the tracker's status here, like the terminal does after the window closes.
$outBar = New-Stack 2
$outBar.Margin = Pad 0 16 0 6
[void]$outBar.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('Percent', 100)))
[void]$outBar.ColumnStyles.Add((New-Object System.Windows.Forms.ColumnStyle('AutoSize')))
$outHead = New-Label 'TRACKER OUTPUT' $FontSmall $C.Dim
$outHead.Anchor = 'Left'
$btnLive = New-Button 'Watch live'
$outBar.Controls.Add($outHead, 0, 0)
$outBar.Controls.Add($btnLive, 1, 0)
Add-Row $activity $outBar

$tbLog = New-Object System.Windows.Forms.RichTextBox
$tbLog.ReadOnly = $true; $tbLog.ScrollBars = 'None'; $tbLog.WordWrap = $true; $tbLog.DetectUrls = $false
$tbLog.Font = $FontMono; $tbLog.BackColor = Col $C.Input; $tbLog.ForeColor = Col $C.Muted; $tbLog.BorderStyle = 'None'
$tbLog.Dock = 'Fill'; $tbLog.Margin = Pad 0 0 0 0; $tbLog.TabStop = $false
$logFrame = New-Object System.Windows.Forms.Panel
$logFrame.Dock = 'Fill'; $logFrame.BackColor = Col $C.Input; $logFrame.Padding = Pad 10 8 10 8; $logFrame.Margin = Pad 0 0 0 0
$logFrame.Controls.Add($tbLog)
Add-Row $activity $logFrame $null 'Fill'

# Scrolling without scrollbars: the wheel scrolls the text directly (EM_LINESCROLL). New lines keep
# the view at the bottom only while you are at the bottom, so reading older lines is not interrupted.
$script:followLog = $true
function Get-FirstVisibleLine { return [int][ArmoryNative.Theme]::SendMessage($tbLog.Handle, 0xCE, [IntPtr]::Zero, [IntPtr]::Zero) }
function Move-LogBy([int]$Lines) { [void][ArmoryNative.Theme]::SendMessage($tbLog.Handle, 0xB6, [IntPtr]::Zero, [IntPtr]$Lines) }
function Move-LogToEnd { $tbLog.SelectionStart = $tbLog.TextLength; $tbLog.SelectionLength = 0; $tbLog.ScrollToCaret() }
function Test-LogAtEnd {
    if ($tbLog.TextLength -eq 0) { return $true }
    # At the end when the last character is inside the visible area.
    $lastPos = $tbLog.GetPositionFromCharIndex($tbLog.TextLength - 1)
    return ($lastPos.Y -lt $tbLog.ClientSize.Height)
}
$tbLog.Add_MouseWheel({
    param($src, $e)
    Move-LogBy (-[int]($e.Delta / 120) * 3)
    $script:followLog = Test-LogAtEnd
    if ($e -is [System.Windows.Forms.HandledMouseEventArgs]) { $e.Handled = $true }
})
$tbLog.Add_KeyUp({ $script:followLog = Test-LogAtEnd })

function Get-LogColor([string]$Line) {
    switch (Get-LineColor $Line) { 'Red' { $C.Err } 'Green' { $C.Ok } 'Yellow' { $C.Warn } 'Cyan' { $C.Info } default { $C.Muted } }
}
function Write-Log([string]$Text, [string]$Color = '') {
    if (-not $Color) { $Color = Get-LogColor $Text }
    $first = Get-FirstVisibleLine
    $tbLog.SelectionStart = $tbLog.TextLength
    $tbLog.SelectionLength = 0
    $tbLog.SelectionColor = Col $Color
    $tbLog.SelectedText = $(if ($tbLog.TextLength -gt 0) { "`n$Text" } else { $Text })
    if ($script:followLog) { Move-LogToEnd } else { Move-LogBy ($first - (Get-FirstVisibleLine)) }
}
function Clear-Log { $tbLog.Clear(); $script:followLog = $true }
Write-Log 'Messages from the build, the upload and the tracker appear here.' $C.Dim

function Show-Banner([string]$Kind, [string]$Text) {
    $map = @{
        ok   = @('#16301f', $C.Ok,   $G.Check)
        warn = @('#352b1a', $C.Warn, '!')
        err  = @('#3a1d1b', $C.Err,  $G.Cross)
        info = @('#18262f', $C.Info, $G.Dot)
    }
    $style = $map[$Kind]
    $banner.BackColor = Col $style[0]
    $bannerText.ForeColor = Col $style[1]
    $bannerText.Text = "$($style[2])  $Text"
    $banner.Visible = $true
    Update-Wrap
}

function Update-Wrap {
    foreach ($l in $script:wrapLabels) {
        $container = $l.Parent
        if (-not $container) { continue }
        $width = $container.ClientSize.Width - $container.Padding.Horizontal - (Px 2)
        if ($l -eq $note) { $width = $actions.ClientSize.Width - $btnSave.Width - (Px 24) }
        $l.MaximumSize = New-Object System.Drawing.Size([Math]::Max((Px 140), $width), 0)
    }
    $barInner.Height = $barOuter.Height
}

# The window is as tall as the setup column needs, so nothing ever scrolls.
function Fit-Height {
    $needed = $left.GetPreferredSize((New-Object System.Drawing.Size($left.Width, 0))).Height + $form.Padding.Vertical + (Px 6)
    $max = $workArea.Height - (Px 40)
    $height = [Math]::Min([Math]::Max($needed, $form.ClientSize.Height), $max)
    $form.ClientSize = New-Object System.Drawing.Size($form.ClientSize.Width, $height)
    $chrome = $form.Height - $form.ClientSize.Height
    $form.MinimumSize = New-Object System.Drawing.Size((Px 860), [Math]::Min($needed + $chrome, $max + $chrome))
}

# Form.CenterToScreen() is protected (not callable from PowerShell), so centre on the work area here.
function Move-ToCenter {
    $x = $workArea.X + [Math]::Max(0, [int](($workArea.Width - $form.Width) / 2))
    $y = $workArea.Y + [Math]::Max(0, [int](($workArea.Height - $form.Height) / 2))
    $form.Location = New-Object System.Drawing.Point($x, $y)
}

$form.Add_Resize({
    Update-Wrap
    foreach ($combo in @($cbSsid, $cbFirearm, $cbPort)) { Clear-ComboHighlight $combo }
})

# ================================================================ window: progress bar

$script:marquee = $false
$script:marqueePos = 0
$animTimer = New-Object System.Windows.Forms.Timer
$animTimer.Interval = 30
$animTimer.Add_Tick({
    if (-not $script:marquee) { return }
    $w = $barOuter.ClientSize.Width
    $barInner.Width = [int]($w * 0.25)
    $script:marqueePos = ($script:marqueePos + (Px 6)) % ($w + $barInner.Width)
    $barInner.Left = $script:marqueePos - $barInner.Width
})

function Set-Stage([string]$Text, [double]$Percent = -1) {
    $stageText.Text = $Text
    $stageText.ForeColor = Col $C.Text
    if ($Percent -lt 0) {
        $script:marquee = $true
        $animTimer.Start()
    } else {
        $script:marquee = $false
        $barInner.Left = 0
        $barInner.Width = [int]($barOuter.ClientSize.Width * [Math]::Min(100, $Percent) / 100)
    }
}
function Stop-Stage([string]$Text, [bool]$Full) {
    $script:marquee = $false
    $animTimer.Stop()
    $barInner.Left = 0
    $barInner.Width = $(if ($Full) { $barOuter.ClientSize.Width } else { 0 })
    $stageText.Text = $Text
    $stageText.ForeColor = Col $C.Muted
}

# ================================================================ window: detection into the fields

$script:networks = @{}

function Update-SsidHint {
    $ssid = $cbSsid.Text.Trim()
    if (-not $ssid) { Set-Hint $hintSsid 'info' 'Pick or type the hotspot name.'; return }
    if ($script:networks.Count -gt 0 -and -not $script:networks.Contains($ssid)) {
        Set-Hint $hintSsid 'warn' "'$ssid' is not in range right now. Is the phone hotspot on?"
    } elseif ($script:networks.Contains($ssid) -and -not $script:networks[$ssid]) {
        Set-Hint $hintSsid 'warn' "'$ssid' is only on 5 GHz. Turn on 2.4 GHz on the phone (iPhone: Maximize Compatibility)."
    } elseif ($script:networks.Contains($ssid)) {
        Set-Hint $hintSsid 'ok' "'$ssid' is in range on 2.4 GHz."
    } else {
        Set-Hint $hintSsid '' ''
    }
    Update-Wrap
}

function Update-LaptopHints {
    $ssid = $cbSsid.Text.Trim()
    $laptop = Get-LaptopWifi
    if (-not $laptop.Ssid) {
        Set-Hint $hintLaptop 'err' 'This laptop is not on any Wi-Fi. Connect it to the hotspot, then press Detect again.'
    } elseif ($ssid -and $laptop.Ssid -ne $ssid) {
        Set-Hint $hintLaptop 'err' "This laptop is on '$($laptop.Ssid)', not '$ssid'. Connect it to the hotspot, then press Detect again."
    } else {
        Set-Hint $hintLaptop 'ok' "On '$($laptop.Ssid)' ($($laptop.Band))."
    }
    if (Test-Backend $tbIp.Text.Trim()) {
        Set-Hint $hintBackend 'ok' 'Backend is running and reachable at this address.'
    } else {
        Set-Hint $hintBackend 'warn' 'Backend not reachable. Start it with: php artisan serve --host 0.0.0.0 --port 8000'
    }
    Update-Wrap
}

function Update-Networks {
    $keep = $cbSsid.Text.Trim()
    $script:networks = Get-VisibleNetworks
    $cbSsid.Items.Clear()
    foreach ($name in $script:networks.Keys) { [void]$cbSsid.Items.Add($name) }
    if ($keep) { $cbSsid.Text = $keep }
    else {
        $laptopWifi = (Get-LaptopWifi).Ssid
        $cbSsid.Text = $(if ($laptopWifi) { $laptopWifi } else { Get-ConfigDefine 'WIFI_SSID' })
    }
    Clear-ComboHighlight $cbSsid
    Update-SsidHint
}

function Update-Ip {
    $tbIp.Text = Get-LaptopIp
    Update-LaptopHints
}

function Update-Ports {
    $cbPort.Items.Clear()
    $ports = @(Get-TrackerPorts)  # @() so one port still has .Count (Windows PowerShell 5.1)
    foreach ($p in $ports) { [void]$cbPort.Items.Add("$($p.Port)   $($p.Label)") }
    if ($ports.Count -gt 0) {
        $cbPort.SelectedIndex = 0
        Set-Hint $hintPort 'ok' 'Tracker found.'
    } else {
        $cbPort.Text = ''
        Set-Hint $hintPort 'err' 'No tracker found. Plug the ESP32 in with a USB data cable, then press Refresh.'
    }
    Clear-ComboHighlight $cbPort
    Update-Wrap
}

function Update-Firearms {
    $cbFirearm.Items.Clear()
    $list = @(Get-TrackableFirearms)
    foreach ($f in $list) { [void]$cbFirearm.Items.Add($f) }
    $current = Get-ConfigDefine 'EQUIPMENT_ID'
    $match = $list | Where-Object { $_ -match "^$current - " } | Select-Object -First 1
    if ($match) { $cbFirearm.Text = $match }
    elseif ($list.Count -gt 0) { $cbFirearm.SelectedIndex = 0 }
    else { $cbFirearm.Text = $current }
    if ($list.Count -eq 0) {
        Set-Hint $hintFirearm 'warn' 'No firearm with GPS tracking on was found (is MySQL running?). The number above is used as typed.'
    } else {
        Set-Hint $hintFirearm '' ''
    }
    Clear-ComboHighlight $cbFirearm
    Update-Wrap
}

$chkShow.Add_CheckedChanged({ $tbPass.UseSystemPasswordChar = -not $chkShow.Checked })
$btnScan.Add_Click({ if (-not $script:busy) { Update-Networks; Update-LaptopHints } })
$btnIp.Add_Click({ if (-not $script:busy) { Update-Ip } })
$btnPorts.Add_Click({ if (-not $script:busy) { Update-Ports } })
$cbSsid.Add_Leave({ Update-SsidHint; Update-LaptopHints })
$cbSsid.Add_SelectedIndexChanged({ Update-SsidHint; Update-LaptopHints })
foreach ($combo in @($cbFirearm, $cbPort)) { $combo.Add_SelectedIndexChanged({ param($src) Clear-ComboHighlight $src }) }

# ================================================================ window: flash and verify

$script:proc = $null
$script:readPos = @{}
$script:serial = $null
$script:verifyUntil = [datetime]::MinValue
$script:serialBuffer = ''
$script:busy = $false
$script:run = @{}

function Read-NewText([string]$Path) {
    if (-not (Test-Path $Path)) { return '' }
    $fs = [IO.File]::Open($Path, 'Open', 'Read', 'ReadWrite')
    try {
        $start = 0; if ($script:readPos.ContainsKey($Path)) { $start = $script:readPos[$Path] }
        if ($fs.Length -le $start) { return '' }
        [void]$fs.Seek($start, 'Begin')
        $text = (New-Object IO.StreamReader($fs)).ReadToEnd()
        $script:readPos[$Path] = $fs.Length
        return $text
    } finally { $fs.Close() }
}

# Inputs stay readable while locked: text boxes go read-only, buttons only change colour.
function Set-Busy([bool]$Busy) {
    $script:busy = $Busy
    foreach ($t in @($tbPass, $tbIp)) { $t.ReadOnly = $Busy; $t.BackColor = Col $C.Input }
    $chkShow.AutoCheck = -not $Busy
    foreach ($b in @($btnScan, $btnIp, $btnPorts, $btnLive)) { Set-ButtonLook $b $false (-not $Busy) }
    Set-ButtonLook $btnSave $true (-not $Busy)
    $btnSave.Text = $(if ($Busy) { "Uploading$($G.Ellipsis)" } elseif ($script:run.Saved) { 'Save again' } else { 'Save to tracker' })
}
foreach ($combo in @($cbSsid, $cbFirearm)) { $combo.Add_KeyPress({ param($src, $e) if ($script:busy) { $e.Handled = $true } }) }
foreach ($combo in @($cbSsid, $cbFirearm, $cbPort)) { $combo.Add_DropDown({ param($src) if ($script:busy) { $src.DroppedDown = $false } }) }

function Complete-Run([string]$Kind, [string]$Text, [int]$FailedStep = -1) {
    if ($FailedStep -ge 0) { Set-Step $FailedStep 'failed' }
    $done = $Kind -eq 'ok'
    Stop-Stage $(if ($done) { 'Finished.' } else { 'Stopped.' }) $done
    Show-Banner $Kind $Text
    $script:run.Saved = $true
    Set-Busy $false
    # Watching live before Save? Pick it up again, unless the run failed.
    if ($script:resumeLive -and $Kind -ne 'err') { Start-Live -Quiet }
    $script:resumeLive = $false
}

# ================================================================ window: optional live status

$script:live = $null
$script:liveBuffer = ''
$script:resumeLive = $false

$liveTimer = New-Object System.Windows.Forms.Timer
$liveTimer.Interval = 250
$liveTimer.Add_Tick({
    try {
        $script:liveBuffer += $script:live.ReadExisting()
    } catch {
        Stop-Live
        Write-Log 'Live status stopped: the tracker was unplugged.' $C.Warn
        return
    }
    while ($script:liveBuffer -match "^(.*?)\r?\n") {
        $line = $Matches[1].TrimEnd()
        $script:liveBuffer = $script:liveBuffer.Substring($Matches[0].Length)
        if (-not $line.Trim() -or $line -match '^\s*\.+\s*$') { continue }
        Write-Log ("{0}  {1}" -f (Get-Date -Format 'HH:mm:ss'), $line) (Get-LogColor $line)
    }
})

function Start-Live([switch]$Quiet) {
    $port = ($cbPort.Text -split '\s')[0]
    if ($port -notmatch '^COM\d+$') {
        if (-not $Quiet) { Show-Banner 'err' 'No tracker port. Plug the ESP32 in by USB and press Refresh.' }
        return
    }
    try {
        $sp = New-Object System.IO.Ports.SerialPort $port, 115200, 'None', 8, 'One'
        $sp.Encoding = [Text.Encoding]::UTF8
        $sp.DtrEnable = $false
        $sp.RtsEnable = $false
        $sp.Open()
    } catch {
        Show-Banner 'err' "Could not open ${port} for live status: $($_.Exception.Message) Close any other monitor that uses it."
        return
    }
    $script:live = $sp
    $script:liveBuffer = ''
    $outHead.Text = "TRACKER OUTPUT   $($G.Dot) LIVE"
    $outHead.ForeColor = Col $C.Ok
    $btnLive.Text = 'Stop watching'
    Write-Log "Watching the tracker live on $port$($G.Ellipsis)" $C.Info
    $script:followLog = $true
    Move-LogToEnd
    $liveTimer.Start()
}

function Stop-Live {
    $liveTimer.Stop()
    try { if ($script:live -and $script:live.IsOpen) { $script:live.Close() } } catch { }
    $script:live = $null
    $outHead.Text = 'TRACKER OUTPUT'
    $outHead.ForeColor = Col $C.Dim
    $btnLive.Text = 'Watch live'
}

$btnLive.Add_Click({
    if ($script:busy) { return }
    if ($script:live) { Stop-Live; Write-Log 'Stopped watching.' $C.Dim }
    else { Start-Live }
})

# Lines worth showing from arduino-cli / esptool; the rest (hundreds of "Writing at") is the progress bar.
$KeepLine = 'Sketch uses|Global variables|Connecting|Chip is|Chip type|Erasing|Erase|Wrote|Hash of data|Hard resetting|error|Error|fail|Failed|fatal|No such|not found|denied|busy'

$flashTimer = New-Object System.Windows.Forms.Timer
$flashTimer.Interval = 300
$flashTimer.Add_Tick({
    foreach ($f in @($OutLog, $ErrLog)) {
        $t = Read-NewText $f
        if (-not $t) { continue }
        foreach ($chunk in ($t -split "`n")) {
            $line = ($chunk -split "`r" | Where-Object { $_.Trim() } | Select-Object -Last 1)
            if (-not $line) { continue }
            $line = $line.TrimEnd()
            if ($line -match 'Writing at .*?(\d+(?:\.\d+)?)%') {
                $pct = [double]$Matches[1]
                Set-Stage ("Uploading the firmware   {0:0}%" -f $pct) $pct
                continue
            }
            if ($f -eq $ErrLog -or $line -match $KeepLine) { Write-Log $line }
            if ($line -match '^Sketch uses') { Set-Stage "Firmware built. Connecting to the tracker$($G.Ellipsis)" }
            elseif ($line -match '^Connecting') { Set-Stage "Connecting to the tracker (if this stalls, hold its BOOT button)$($G.Ellipsis)" }
            elseif ($line -match 'Erasing|Chip erase') { Set-Stage "Erasing the old settings$($G.Ellipsis)" }
            elseif ($line -match 'Hash of data verified') { Set-Stage 'Upload verified.' 100 }
        }
    }
    if ($script:proc -and $script:proc.HasExited) {
        $flashTimer.Stop()
        if ($script:proc.ExitCode -eq 0) {
            Set-Step 1 'done'
            Set-Step 2 'running'
            Set-Stage "Restarting the tracker and waiting for its Wi-Fi$($G.Ellipsis)"
            Start-Verify
        } else {
            Complete-Run 'err' 'Upload failed. Check the USB cable and the port, then try again.' 1
        }
    }
})

$verifyTimer = New-Object System.Windows.Forms.Timer
$verifyTimer.Interval = 250
$verifyTimer.Add_Tick({
    $result = $null
    try { $script:serialBuffer += $script:serial.ReadExisting() } catch { }
    while ($script:serialBuffer -match "^(.*?)\r?\n") {
        $line = $Matches[1]
        $script:serialBuffer = $script:serialBuffer.Substring($Matches[0].Length)
        if (-not $line.Trim() -or $line -match '^\s*\.+\s*$') { continue }
        Write-Log "tracker> $line"
        if ($line -match '\[wifi\] connected\s+ip=(\S+)') {
            $result = @('ok', ("Saved. The tracker joined '{0}' (address {1}). It starts sending once it has a GPS fix under open sky." -f $script:run.Ssid, $Matches[1]))
        } elseif ($line -match '\[wifi\] failed - (.*)') {
            $result = @('err', "Saved, but the tracker could not join the Wi-Fi: $($Matches[1])")
        }
    }
    if (-not $result -and (Get-Date) -gt $script:verifyUntil) {
        $result = @('warn', 'Saved and flashed, but the tracker did not report its Wi-Fi within 45 seconds.')
    }
    if ($result) {
        $verifyTimer.Stop()
        try { $script:serial.Close() } catch { }
        if ($result[0] -eq 'ok') { Set-Step 2 'done'; Complete-Run 'ok' $result[1] }
        else { Complete-Run $result[0] $result[1] 2 }
    }
})

function Start-Verify {
    try {
        $script:serial = New-Object System.IO.Ports.SerialPort $script:run.Port, 115200, 'None', 8, 'One'
        $script:serial.Encoding = [Text.Encoding]::UTF8
        $script:serial.DtrEnable = $false
        $script:serial.RtsEnable = $false
        $script:serial.Open()
    } catch {
        Complete-Run 'warn' "Saved and flashed, but $($script:run.Port) could not be opened to check the Wi-Fi: $($_.Exception.Message)" 2
        return
    }
    $script:serialBuffer = ''
    $script:verifyUntil = (Get-Date).AddSeconds(45)
    $verifyTimer.Start()
}

$btnSave.Add_Click({
    if ($script:busy) { return }
    $banner.Visible = $false
    $ssid = $cbSsid.Text.Trim()
    $pass = $tbPass.Text
    $ip = $tbIp.Text.Trim()
    $port = ($cbPort.Text -split '\s')[0]
    $parsed = $null

    if (-not $ssid) { Show-Banner 'err' 'Enter the hotspot Wi-Fi name.'; $cbSsid.Focus(); return }
    if ($pass.Length -gt 0 -and $pass.Length -lt 8) { Show-Banner 'err' 'A Wi-Fi password has at least 8 characters.'; $tbPass.Focus(); return }
    if ($ip -notmatch '^\d{1,3}(\.\d{1,3}){3}$' -or -not [System.Net.IPAddress]::TryParse($ip, [ref]$parsed)) {
        Show-Banner 'err' "'$ip' is not a valid IP address. Connect the laptop to the hotspot and press Detect again."; $tbIp.Focus(); return
    }
    if ($cbFirearm.Text -notmatch '^\s*(\d+)') { Show-Banner 'err' 'Choose the firearm (its number comes first).'; $cbFirearm.Focus(); return }
    $equipment = [int]$Matches[1]
    if ($port -notmatch '^COM\d+$') { Show-Banner 'err' 'No tracker port. Plug the ESP32 in by USB and press Refresh.'; return }
    $cli = Find-ArduinoCli
    if (-not $cli) { Show-Banner 'err' 'arduino-cli was not found. Install it first (RUNNING_THE_SYSTEM.txt, step 5.1).'; return }

    # The upload needs the USB port: pause live status now, resume after the run (Complete-Run).
    $script:resumeLive = [bool]$script:live
    if ($script:live) { Stop-Live }

    $script:run = @{ Ssid = $ssid; Port = $port; Saved = $false }
    Reset-Steps
    Clear-Log
    Set-Step 0 'running'
    try {
        Write-TrackerConfig $ssid $pass $ip $equipment
    } catch {
        Set-Step 0 'failed'
        Show-Banner 'err' "Could not write config.h: $($_.Exception.Message)"
        return
    }
    Set-Step 0 'done'
    Write-Log "Settings: Wi-Fi '$ssid', server http://${ip}:$ApiPort, firearm $equipment"
    Write-Log "Uploading to $port (erases the old settings first)"

    Set-Step 1 'running'
    Set-Busy $true
    Set-Stage "Building the firmware (about a minute)$($G.Ellipsis)"

    foreach ($f in @($OutLog, $ErrLog)) { Set-Content -Path $f -Value '' -Encoding ascii }
    $script:readPos = @{}
    $arguments = @('compile', '--upload', '-p', $port, '--fqbn', $Fqbn,
                   '--board-options', 'EraseFlash=all', "`"$SketchDir`"")
    try {
        $script:proc = Start-Process -FilePath $cli -ArgumentList $arguments -PassThru -WindowStyle Hidden `
            -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog
        $null = $script:proc.Handle  # keeps ExitCode readable after the process ends
        $flashTimer.Start()
    } catch {
        Complete-Run 'err' "Could not start arduino-cli: $($_.Exception.Message)" 1
    }
})

$form.Add_FormClosing({
    param($src, $e)
    if ($script:busy) {
        $e.Cancel = $true
        Show-Banner 'warn' 'Please wait until the upload finishes. Closing now can leave the tracker half-flashed.'
        return
    }
    $script:monitorPort = ($cbPort.Text -split '\s')[0]
    Stop-Live
    $flashTimer.Stop(); $verifyTimer.Stop(); $animTimer.Stop()
    try { if ($script:serial -and $script:serial.IsOpen) { $script:serial.Close() } } catch { }
})

$form.Add_Shown({
    $form.Cursor = [System.Windows.Forms.Cursors]::WaitCursor
    Update-Wrap
    $form.Refresh()
    Update-Ports
    Update-Networks
    Update-Ip
    Update-Firearms
    Update-Wrap
    Fit-Height
    Update-Wrap
    Move-ToCenter
    $form.Cursor = [System.Windows.Forms.Cursors]::Default
    [void]$tbPass.Focus()
})

# ================================================================ safety net

# Any unexpected error in the window is shown in the window itself; the window stays usable.
function Report-UiError([System.Exception]$Exception) {
    $message = $Exception.Message
    try {
        Write-Log "Internal error: $message"
        if ($script:busy -and -not ($script:proc -and -not $script:proc.HasExited)) {
            $flashTimer.Stop(); $verifyTimer.Stop()
            try { if ($script:serial -and $script:serial.IsOpen) { $script:serial.Close() } } catch { }
            Stop-Stage 'Stopped.' $false
            Set-Busy $false
        }
        Show-Banner 'err' "Something went wrong in this window: $message  You can try again."
    } catch {
        Write-Host "Tracker setup error: $message" -ForegroundColor Red
    }
}
[System.Windows.Forms.Application]::add_ThreadException({ param($src, $e) Report-UiError $e.Exception })

# ================================================================ run

$script:monitorPort = ''
Write-Host 'Tracker setup window is open. Close it when done to see live tracker status here.' -ForegroundColor DarkGray
try {
    [void]$form.ShowDialog()
} catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'ArmoryDB - Tracker setup') | Out-Null
} finally {
    $form.Dispose()
}

Start-ConsoleMonitor $script:monitorPort
