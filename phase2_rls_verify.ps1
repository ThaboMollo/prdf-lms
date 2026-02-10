$ErrorActionPreference = 'Stop'

function Add-Result($name, $ok, $detail) {
  $script:results += [pscustomobject]@{
    check = $name
    pass = $ok
    detail = $detail
  }
}

function Get-EnvMap {
  $map = @{}
  Get-Content 'prdf-lms/.env' -ErrorAction SilentlyContinue | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      $map[$matches[1].Trim()] = $matches[2].Trim()
    }
  }
  return $map
}

$results = @()
$envMap = Get-EnvMap
$tokens = Get-Content -Raw 'prdf-lms/.phase2_tokens.tmp.json' | ConvertFrom-Json

$supabaseUrl = $envMap['SUPABASE_URL']
$anonKey = $envMap['SUPABASE_ANON_KEY']
$serviceRoleKey = $envMap['SUPABASE_SERVICE_ROLE_KEY']

if (-not $env:SUPABASE_DB_CONNECTION_STRING -and $envMap['SUPABASE_DB_CONNECTION_STRING']) {
  $env:SUPABASE_DB_CONNECTION_STRING = $envMap['SUPABASE_DB_CONNECTION_STRING']
}

$env:SUPABASE_URL = $supabaseUrl
$env:SUPABASE_ANON_KEY = $anonKey
$env:SUPABASE_SERVICE_ROLE_KEY = $serviceRoleKey
$env:SUPABASE_JWT_AUDIENCE = 'authenticated'

$apiProc = Start-Process dotnet -ArgumentList 'run --project src/PRDF.Lms.Api/PRDF.Lms.Api.csproj --urls http://localhost:5080' -WorkingDirectory 'c:\Users\ThaboMponya\Documents\DEV\loanShark\prdf-lms\backend' -PassThru
Start-Sleep -Seconds 4

try {
  $client1Token = $tokens.clientToken
  $client2Email = "client2+" + [Guid]::NewGuid().ToString("N").Substring(0, 8) + "@test.local"
  $client2Password = "TempP@ssw0rd!123"

  $adminHeaders = @{
    apikey = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
    "Content-Type" = "application/json"
  }

  $createUserBody = @{
    email = $client2Email
    password = $client2Password
    email_confirm = $true
    user_metadata = @{ full_name = 'Client Two' }
  } | ConvertTo-Json -Depth 5

  $createdUser = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/admin/users" -Headers $adminHeaders -Body $createUserBody
  $client2UserId = $createdUser.id
  Add-Result 'create_client2_user' $true $client2UserId

  $restHeaders = @{
    apikey = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
    "Content-Type" = "application/json"
    Prefer = "return=representation"
  }

  $profileBody = @{
    user_id = $client2UserId
    full_name = 'Client Two'
    phone = $null
  } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/profiles" -Headers $restHeaders -Body $profileBody | Out-Null
  Add-Result 'create_client2_profile' $true 'ok'

  $roleRows = Invoke-RestMethod -Method Get -Uri "$supabaseUrl/rest/v1/roles?name=eq.Client&select=id" -Headers @{
    apikey = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
  }
  if (-not $roleRows -or $roleRows.Count -lt 1) {
    throw "Client role not found in roles table."
  }
  $clientRoleId = $roleRows[0].id

  $userRoleBody = @{
    user_id = $client2UserId
    role_id = $clientRoleId
  } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/user_roles" -Headers $restHeaders -Body $userRoleBody | Out-Null
  Add-Result 'assign_client2_role' $true "role_id=$clientRoleId"

  $clientBody = @{
    user_id = $client2UserId
    business_name = 'Client Two Holdings'
    registration_no = 'REG-CLIENT2'
    address = 'Client Two Address'
  } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/clients" -Headers $restHeaders -Body $clientBody | Out-Null
  Add-Result 'create_client2_entity' $true 'ok'

  $tokenBody = @{
    email = $client2Email
    password = $client2Password
  } | ConvertTo-Json

  $client2TokenResponse = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/token?grant_type=password" -Headers @{
    apikey = $anonKey
    "Content-Type" = "application/json"
  } -Body $tokenBody

  $client2Token = $client2TokenResponse.access_token
  if ([string]::IsNullOrWhiteSpace($client2Token)) {
    throw "Could not obtain client2 access token."
  }
  Add-Result 'client2_sign_in' $true $client2Email

  $createBody = @{
    requestedAmount = 50000
    termMonths = 12
    purpose = 'RLS verification app'
    businessName = 'Client One Trading'
    registrationNo = 'REG-RLS-001'
    address = 'RLS Address'
  } | ConvertTo-Json

  $created = Invoke-RestMethod -Method Post -Uri 'http://localhost:5080/api/applications' -Headers @{
    Authorization = "Bearer $client1Token"
    "Content-Type" = "application/json"
  } -Body $createBody
  $appId = $created.id
  Add-Result 'create_client1_application' $true $appId

  try {
    Invoke-RestMethod -Method Get -Uri "http://localhost:5080/api/applications/$appId" -Headers @{ Authorization = "Bearer $client2Token" } | Out-Null
    Add-Result 'api_cross_client_read_blocked' $false 'Client2 unexpectedly read Client1 application.'
  }
  catch {
    $status = $_.Exception.Response.StatusCode.value__
    Add-Result 'api_cross_client_read_blocked' ($status -eq 403 -or $status -eq 404) "status=$status"
  }

  $client2RlsRows = Invoke-RestMethod -Method Get -Uri "$supabaseUrl/rest/v1/loan_applications?id=eq.$appId&select=id" -Headers @{
    apikey = $anonKey
    Authorization = "Bearer $client2Token"
  }
  $client1RlsRows = Invoke-RestMethod -Method Get -Uri "$supabaseUrl/rest/v1/loan_applications?id=eq.$appId&select=id" -Headers @{
    apikey = $anonKey
    Authorization = "Bearer $client1Token"
  }

  $client2Blocked = ($client2RlsRows.Count -eq 0)
  $client1Visible = ($client1RlsRows.Count -ge 1)
  Add-Result 'supabase_rls_cross_client_blocked' $client2Blocked ("client2_rows=" + $client2RlsRows.Count)
  Add-Result 'supabase_rls_owner_visible' $client1Visible ("client1_rows=" + $client1RlsRows.Count)

  $results | ConvertTo-Json -Depth 5 | Set-Content 'prdf-lms/.phase2_rls_verify_results.json'
  $results | Format-Table -AutoSize | Out-String | Write-Output
}
finally {
  Stop-Process -Id $apiProc.Id -Force -ErrorAction SilentlyContinue
}
