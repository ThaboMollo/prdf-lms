$ErrorActionPreference = 'Stop'
$tokens = Get-Content -Raw 'prdf-lms/.phase2_tokens.tmp.json' | ConvertFrom-Json
$clientToken = $tokens.clientToken
$officerToken = $tokens.officerToken

$envMap = @{}
Get-Content 'prdf-lms/.env' -ErrorAction SilentlyContinue | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $envMap[$matches[1].Trim()] = $matches[2].Trim()
  }
}
Get-Content 'prdf-lms/frontend/.env' | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $envMap[$matches[1].Trim()] = $matches[2].Trim()
  }
}

$env:SUPABASE_URL = $envMap['SUPABASE_URL']
$env:SUPABASE_ANON_KEY = $envMap['SUPABASE_ANON_KEY']
$env:SUPABASE_SERVICE_ROLE_KEY = $envMap['SUPABASE_SERVICE_ROLE_KEY']
$env:SUPABASE_JWT_AUDIENCE = 'authenticated'
if ($envMap['SUPABASE_DB_CONNECTION_STRING']) {
  $env:SUPABASE_DB_CONNECTION_STRING = $envMap['SUPABASE_DB_CONNECTION_STRING']
}
if (-not $env:SUPABASE_DB_CONNECTION_STRING) { $env:SUPABASE_DB_CONNECTION_STRING = '' }

$p = Get-Process PRDF.Lms.Api -ErrorAction SilentlyContinue
if ($p) { $p | Stop-Process -Force }

$proc = Start-Process dotnet -ArgumentList 'run --project src/PRDF.Lms.Api/PRDF.Lms.Api.csproj --urls http://localhost:5080' -WorkingDirectory 'c:\Users\ThaboMponya\Documents\DEV\loanShark\prdf-lms\backend' -PassThru
Start-Sleep -Seconds 4

$results = @()
function Add-Result($name, $ok, $detail) {
  $script:results += [pscustomobject]@{ check = $name; pass = $ok; detail = $detail }
}

function ErrorDetail($err) {
  try {
    if ($err.Exception.Response -and $err.Exception.Response.GetResponseStream) {
      $stream = $err.Exception.Response.GetResponseStream()
      if ($stream) {
        $reader = New-Object System.IO.StreamReader($stream)
        return $reader.ReadToEnd()
      }
    }
  } catch { }
  return $err.Exception.Message
}

try {
  try {
    $h = Invoke-RestMethod -Uri 'http://localhost:5080/health' -Method Get
    Add-Result 'health' $true ($h | ConvertTo-Json -Compress)
  } catch { Add-Result 'health' $false $_.Exception.Message }

  try {
    $m = Invoke-RestMethod -Uri 'http://localhost:5080/me' -Method Get -Headers @{ Authorization = "Bearer $clientToken" }
    Add-Result 'me_client' $true $m.userId
  } catch { Add-Result 'me_client' $false $_.Exception.Message }

  try {
    $m2 = Invoke-RestMethod -Uri 'http://localhost:5080/me' -Method Get -Headers @{ Authorization = "Bearer $officerToken" }
    Add-Result 'me_officer' $true $m2.userId
  } catch { Add-Result 'me_officer' $false $_.Exception.Message }

  $createBody = @{ requestedAmount = 50000; termMonths = 12; purpose = 'Working capital for stock'; businessName = 'Client One Trading'; registrationNo = 'REG-TEST-001'; address = 'Test Address' } | ConvertTo-Json
  $appId = $null

  try {
    $c = Invoke-RestMethod -Uri 'http://localhost:5080/api/applications' -Method Post -Headers @{ Authorization = "Bearer $clientToken"; 'Content-Type' = 'application/json' } -Body $createBody
    $appId = $c.id
    Add-Result 'create_draft' $true $appId
  } catch { Add-Result 'create_draft' $false (ErrorDetail $_) }

  if ($appId) {
    try {
      $s = Invoke-RestMethod -Uri "http://localhost:5080/api/applications/$appId/submit" -Method Post -Headers @{ Authorization = "Bearer $clientToken"; 'Content-Type' = 'application/json' } -Body (@{ note = 'Submitting for review' } | ConvertTo-Json)
      Add-Result 'submit' $true $s.status
    } catch { Add-Result 'submit' $false (ErrorDetail $_) }

    try {
      $ps = Invoke-RestMethod -Uri "http://localhost:5080/api/applications/$appId/documents/presign-upload" -Method Post -Headers @{ Authorization = "Bearer $clientToken"; 'Content-Type' = 'application/json' } -Body (@{ docType = 'BankStatement'; fileName = 'bank-statement.txt'; contentType = 'text/plain' } | ConvertTo-Json)
      Add-Result 'presign_upload' $true $ps.storagePath
    } catch { Add-Result 'presign_upload' $false (ErrorDetail $_) }

    try {
      $hist = Invoke-RestMethod -Uri "http://localhost:5080/api/applications/$appId/history" -Method Get -Headers @{ Authorization = "Bearer $officerToken" }
      Add-Result 'history' $true ("count=" + $hist.Count)
    } catch { Add-Result 'history' $false (ErrorDetail $_) }

    try {
      $st = Invoke-RestMethod -Uri "http://localhost:5080/api/applications/$appId/status" -Method Post -Headers @{ Authorization = "Bearer $officerToken"; 'Content-Type' = 'application/json' } -Body (@{ toStatus = 'UnderReview'; note = 'Checklist started' } | ConvertTo-Json)
      Add-Result 'status_change' $true $st.status
    } catch { Add-Result 'status_change' $false (ErrorDetail $_) }
  }

  $results | ConvertTo-Json -Depth 4 | Set-Content 'prdf-lms/.phase2_verify_results.json'
  $results | Format-Table -AutoSize | Out-String | Write-Output
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
