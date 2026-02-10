$ErrorActionPreference = 'Stop'

$envMap = @{}
Get-Content 'prdf-lms/.env' | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') {
    $envMap[$matches[1].Trim()] = $matches[2].Trim()
  }
}

$supabaseUrl = $envMap['SUPABASE_URL']
$anonKey = $envMap['SUPABASE_ANON_KEY']
$serviceRoleKey = $envMap['SUPABASE_SERVICE_ROLE_KEY']

$internalEmail = 'phase4officer+' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '@test.local'
$internalPassword = 'TempP@ssw0rd!123'

$createUserBody = @{
  email = $internalEmail
  password = $internalPassword
  email_confirm = $true
  user_metadata = @{ full_name = 'Phase4 Officer' }
} | ConvertTo-Json -Depth 5

$createdUser = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/admin/users" -Headers @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  'Content-Type' = 'application/json'
} -Body $createUserBody

$roleRows = Invoke-RestMethod -Method Get -Uri "$supabaseUrl/rest/v1/roles?name=eq.LoanOfficer&select=id" -Headers @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
}

if (-not $roleRows -or $roleRows.Count -lt 1) {
  throw 'LoanOfficer role not found.'
}

$assignRoleBody = @{
  user_id = $createdUser.id
  role_id = $roleRows[0].id
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/user_roles" -Headers @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  'Content-Type' = 'application/json'
  Prefer = 'return=minimal'
} -Body $assignRoleBody | Out-Null

$signInBody = @{ email = $internalEmail; password = $internalPassword } | ConvertTo-Json
$tokenResponse = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/token?grant_type=password" -Headers @{
  apikey = $anonKey
  'Content-Type' = 'application/json'
} -Body $signInBody

$token = $tokenResponse.access_token
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'No access token returned.'
}

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
  $clientBody = @{
    businessName = 'Phase4 Assisted Client'
    registrationNo = 'REG-P4-001'
    address = 'Assisted Address'
    applicantFullName = 'Applicant One'
    applicantEmail = $null
    sendInvite = $false
    redirectTo = $null
  } | ConvertTo-Json

  $clientId = $null
  try {
    $createdClient = Invoke-RestMethod -Method Post -Uri 'http://localhost:5080/api/clients/assisted' -Headers @{
      Authorization = "Bearer $token"
      'Content-Type' = 'application/json'
    } -Body $clientBody
    $clientId = $createdClient.id
    Add-Result 'assisted_client_create' $true $clientId
  } catch {
    Add-Result 'assisted_client_create' $false (ErrorDetail $_)
  }

  if ($clientId) {
    $inviteEmail = 'phase4invite' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '@example.com'
    $inviteBody = @{
      applicantEmail = $inviteEmail
      applicantFullName = 'Invited Applicant'
      redirectTo = 'http://localhost:5173/login'
    } | ConvertTo-Json

    try {
      $inviteResponse = Invoke-RestMethod -Method Post -Uri "http://localhost:5080/api/clients/$clientId/invite" -Headers @{
        Authorization = "Bearer $token"
        'Content-Type' = 'application/json'
      } -Body $inviteBody
      Add-Result 'client_invite' $true $inviteResponse.status
    } catch {
      Add-Result 'client_invite' $false (ErrorDetail $_)
    }
  }

  $results | ConvertTo-Json -Depth 5 | Set-Content 'prdf-lms/.phase4_verify_assisted_onboarding.json'
  $results | Format-Table -AutoSize | Out-String | Write-Output
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
