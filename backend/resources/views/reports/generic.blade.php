<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{{ $title }}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: DejaVu Sans, sans-serif; font-size: 10px; color: #1c1c1c; margin: 24px; }
  header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #4d5d2d; padding-bottom: 8px; margin-bottom: 14px; }
  .brand { font-weight: 700; color: #4d5d2d; font-size: 12px; }
  .brand small { display:block; color:#444; font-weight: 400; }
  h1 { font-size: 14px; margin: 0; color: #2c2c2c; }
  .meta { color:#666; font-size: 9px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #c5c5c5; padding: 5px 6px; text-align: left; vertical-align: top; }
  th { background: #4d5d2d; color: #fff; font-weight: 600; text-transform: uppercase; font-size: 9px; letter-spacing: .03em; }
  tr:nth-child(even) td { background: #f6f7f1; }
  footer { margin-top: 14px; font-size: 9px; color:#666; text-align:center; border-top: 1px dashed #999; padding-top: 6px; }
</style>
</head>
<body>
  <header>
    <div class="brand">
      ArmoryDB — 10RCDG
      <small>Real-Time GPS Firearm Tracking & Management System</small>
    </div>
    <div style="text-align:right;">
      <h1>{{ $title }}</h1>
      <div class="meta">Generated: {{ $generatedAt }} · CONFIDENTIAL</div>
    </div>
  </header>

  <table>
    <thead>
      <tr>
        @foreach ($columns as $c)
          <th>{{ str_replace('_', ' ', $c) }}</th>
        @endforeach
      </tr>
    </thead>
    <tbody>
      @forelse ($rows as $row)
        <tr>
          @foreach ($columns as $c)
            <td>{{ $row[$c] ?? '' }}</td>
          @endforeach
        </tr>
      @empty
        <tr><td colspan="{{ count($columns) }}" style="text-align:center; padding:18px;">No records.</td></tr>
      @endforelse
    </tbody>
  </table>

  <footer>
    Property of the 10th Regional Community Defense Group, Reserve Command, Philippine Army.
    For internal use only — Do not redistribute.
  </footer>
</body>
</html>
