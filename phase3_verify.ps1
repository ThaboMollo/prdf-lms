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
  $createBody = @{
    requestedAmount = 65000
    termMonths = 12
    purpose = 'Phase 3 verification loan'
    businessName = 'Client One Trading'
    registrationNo = 'REG-P3-001'
    address = 'Phase 3 Address'
  } | ConvertTo-Json

  $applicationId = $null
  try {
    $created = Invoke-RestMethod -Uri 'http://localhost:5080/api/applications' -Method Post -Headers @{ Authorization = "Bearer $clientToken"; 'Content-Type' = 'application/json' } -Body $createBody
    $applicationId = $created.id
    Add-Result 'create_draft' $true $applicationId
  } catch { Add-Result 'create_draft' $false (ErrorDetail $_) }

  if ($applicationId) {
    try {
      $submitted = Invoke-RestMethod -Uri "http://localhost:5080/api/applications/$applicationId/submit" -Method Post -Headers @{ Authorization = "Bearer $clientToken"; 'Content-Type' = 'application/json' } -Body (@{ note = 'Submit for approval' } | ConvertTo-Json)
      Add-Result 'submit' $true $submitted.status
    } catch { Add-Result 'submit' $false (ErrorDetail $_) }

    try {
      $approved = Invoke-RestMethod -Uri "http://localhost:5080/api/applications/$applicationId/status" -Method Post -Headers @{ Authorization = "Bearer $officerToken"; 'Content-Type' = 'application/json' } -Body (@{ toStatus = 'Approved'; note = 'Approved for Phase 3 test' } | ConvertTo-Json)
      Add-Result 'approve' $true $approved.status
    } catch { Add-Result 'approve' $false (ErrorDetail $_) }

    $loanId = $null
    try {
      $loanRows = Invoke-RestMethod -Method Get -Uri "$($envMap['SUPABASE_URL'])/rest/v1/loans?application_id=eq.$applicationId&select=id&limit=1" -Headers @{ apikey = $envMap['SUPABASE_SERVICE_ROLE_KEY']; Authorization = "Bearer $($envMap['SUPABASE_SERVICE_ROLE_KEY'])" }
      if ($loanRows.Count -ge 1) {
        $loanId = $loanRows[0].id
        Add-Result 'loan_created_on_approval' $true $loanId
      } else {
        Add-Result 'loan_created_on_approval' $false 'no loan row found'
      }
    } catch { Add-Result 'loan_created_on_approval' $false (ErrorDetail $_) }

    if ($loanId) {
      try {
        $loanClient = Invoke-RestMethod -Uri "http://localhost:5080/api/loans/$loanId" -Method Get -Headers @{ Authorization = "Bearer $clientToken" }
        Add-Result 'get_loan_client' $true $loanClient.status
      } catch { Add-Result 'get_loan_client' $false (ErrorDetail $_) }

      try {
        $disb = Invoke-RestMethod -Uri "http://localhost:5080/api/loans/$loanId/disburse" -Method Post -Headers @{ Authorization = "Bearer $officerToken"; 'Content-Type' = 'application/json' } -Body (@{ amount = 65000; reference = 'P3-DISB-001' } | ConvertTo-Json)
        Add-Result 'disburse' $true $disb.status
      } catch { Add-Result 'disburse' $false (ErrorDetail $_) }

      try {
        $repay = Invoke-RestMethod -Uri "http://localhost:5080/api/loans/$loanId/repayments" -Method Post -Headers @{ Authorization = "Bearer $officerToken"; 'Content-Type' = 'application/json' } -Body (@{ amount = 5000; paymentReference = 'P3-REPAY-001' } | ConvertTo-Json)
        Add-Result 'record_repayment' $true ("outstanding=" + $repay.outstandingPrincipal)
      } catch { Add-Result 'record_repayment' $false (ErrorDetail $_) }

      try {
        $portfolio = Invoke-RestMethod -Uri "http://localhost:5080/api/reports/portfolio" -Method Get -Headers @{ Authorization = "Bearer $officerToken" }
        Add-Result 'portfolio_report' $true ("totalLoans=" + $portfolio.totalLoans)
      } catch { Add-Result 'portfolio_report' $false (ErrorDetail $_) }

      try {
        $arrears = Invoke-RestMethod -Uri "http://localhost:5080/api/reports/arrears" -Method Get -Headers @{ Authorization = "Bearer $officerToken" }
        Add-Result 'arrears_report' $true ("count=" + $arrears.Count)
      } catch { Add-Result 'arrears_report' $false (ErrorDetail $_) }
    }
  }

  $results | ConvertTo-Json -Depth 5 | Set-Content 'prdf-lms/.phase3_verify_results.json'
  $results | Format-Table -AutoSize | Out-String | Write-Output
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
