<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ArmoryDB - Password Reset Code</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            background-color: #1a1f16;
            color: #e8e8e0;
            padding: 32px 16px;
            margin: 0;
        }
        .container {
            max-width: 560px;
            margin: 0 auto;
            background-color: #252b1f;
            border-radius: 12px;
            padding: 36px 32px;
            border: 1px solid #3d4a2f;
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.4);
        }
        .header {
            text-align: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid #3d4a2f;
        }
        .header h1 {
            font-size: 20px;
            color: #aeb771;
            margin: 0 0 6px 0;
            letter-spacing: 2px;
            text-transform: uppercase;
        }
        .header p {
            margin: 0;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 3px;
            color: #8fa068;
        }
        .badge {
            display: inline-block;
            padding: 5px 14px;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 1px;
            background-color: #3f4e2f;
            color: #dbe4aa;
            margin-bottom: 16px;
        }
        .title {
            font-size: 22px;
            font-weight: 700;
            color: #f0f0e8;
            margin: 0 0 12px 0;
        }
        .message {
            color: #b8b8a8;
            line-height: 1.6;
            font-size: 14px;
            margin-bottom: 24px;
        }
        .code-container {
            background-color: #151a12;
            border: 1px solid #55673d;
            border-radius: 8px;
            padding: 20px;
            text-align: center;
            margin: 24px 0;
        }
        .code-label {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 2px;
            color: #8fa068;
            margin-bottom: 8px;
        }
        .code-box {
            font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
            font-size: 36px;
            font-weight: 800;
            letter-spacing: 8px;
            color: #c9d880;
            margin: 4px 0;
        }
        .code-expiry {
            font-size: 12px;
            color: #a0a090;
            margin-top: 8px;
        }
        .warning-box {
            background-color: #2e2616;
            border-left: 3px solid #d97706;
            padding: 12px 16px;
            border-radius: 0 6px 6px 0;
            margin: 24px 0;
            font-size: 12px;
            color: #fde68a;
            line-height: 1.5;
        }
        .meta {
            margin-top: 24px;
            padding-top: 18px;
            border-top: 1px solid #3d4a2f;
            font-size: 12px;
            color: #8c8c7c;
            line-height: 1.6;
        }
        .meta strong {
            color: #b8b8a8;
        }
        .footer {
            text-align: center;
            margin-top: 28px;
            font-size: 11px;
            color: #666;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>ArmoryDB</h1>
            <p>10th RCDG · Reserve Command</p>
        </div>

        <div class="badge">Security Verification</div>

        <h2 class="title">Password Reset Code</h2>

        <p class="message">
            Hello <strong>{{ $user->fullName() }}</strong>,<br>
            A request was received to reset the security password for account <strong>{{ $user->username }}</strong>.
            Please use the 6-digit authentication code below to complete the verification process:
        </p>

        <div class="code-container">
            <div class="code-label">Verification Code</div>
            <div class="code-box">{{ $code }}</div>
            <div class="code-expiry">Expires in <strong>{{ $expiresMinutes }} minutes</strong></div>
        </div>

        <div class="warning-box">
            <strong>Security Notice:</strong> Never share this code with anyone. Armory personnel will never ask for your verification code. If you did not initiate this request, contact your Unit Security Officer immediately.
        </div>

        <div class="meta">
            <div><strong>Request IP:</strong> {{ $ipAddress }}</div>
            <div><strong>Timestamp:</strong> {{ now()->toRfc2822String() }}</div>
            <div><strong>Clearance Level:</strong> Level {{ $user->security_clearance }}</div>
        </div>

        <div class="footer">
            <p>This is an automated operational transmission from the ArmoryDB System.<br>
            Do not reply directly to this email.</p>
        </div>
    </div>
</body>
</html>
