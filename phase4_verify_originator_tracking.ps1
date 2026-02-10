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
$password = 'TempP@ssw0rd!123'

function New-User($prefix, $fullName) {
  $email = $prefix + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '@example.com'
  $body = @{
    email = $email
    password = $password
    email_confirm = $true
    user_metadata = @{ full_name = $fullName }
  } | ConvertTo-Json -Depth 5
  $user = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/admin/users" -Headers @{
    apikey = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
    'Content-Type' = 'application/json'
  } -Body $body
  return [pscustomobject]@{ Email = $email; UserId = $user.id }
}

function Assign-Role($userId, $roleName) {
  $roleRows = Invoke-RestMethod -Method Get -Uri "$supabaseUrl/rest/v1/roles?name=eq.$roleName&select=id" -Headers @{
    apikey = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
  }
  $assignRoleBody = @{ user_id = $userId; role_id = $roleRows[0].id } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/user_roles" -Headers @{
    apikey = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
    'Content-Type' = 'application/json'
    Prefer = 'return=minimal'
  } -Body $assignRoleBody | Out-Null
}

function Sign-In($email) {
  $signInBody = @{ email = $email; password = $password } | ConvertTo-Json
  $tokenResponse = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/token?grant_type=password" -Headers @{
    apikey = $anonKey
    'Content-Type' = 'application/json'
  } -Body $signInBody
  return $tokenResponse.access_token
}

$officer = New-User 'phase4officer' 'Phase4 Officer'
$originator = New-User 'phase4originator' 'Phase4 Originator'
Assign-Role $officer.UserId 'LoanOfficer'
Assign-Role $originator.UserId 'Originator'

$client1 = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/clients?select=id" -Headers @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  'Content-Type' = 'application/json'
  Prefer = 'return=representation'
} -Body (@{ business_name = 'Applicant One Biz'; registration_no = 'REG-O-1'; address = 'Address 1' } | ConvertTo-Json)
$client2 = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/clients?select=id" -Headers @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  'Content-Type' = 'application/json'
  Prefer = 'return=representation'
} -Body (@{ business_name = 'Applicant Two Biz'; registration_no = 'REG-O-2'; address = 'Address 2' } | ConvertTo-Json)

$officerToken = Sign-In $officer.Email
$originatorToken = Sign-In $originator.Email

$proc = Start-Process dotnet -ArgumentList 'run --project src/PRDF.Lms.Api/PRDF.Lms.Api.csproj --urls http://localhost:5080' -WorkingDirectory 'c:\Users\ThaboMponya\Documents\DEV\loanShark\prdf-lms\backend' -PassThru
Start-Sleep -Seconds 4

$results = @()
function Add-Result($name, $ok, $detail) {
  $script:results += [pscustomobject]@{ check = $name; pass = $ok; detail = $detail }
}

try {
  $app1 = Invoke-RestMethod -Method Post -Uri 'http://localhost:5080/api/applications' -Headers @{
    Authorization = "Bearer $officerToken"
    'Content-Type' = 'application/json'
  } -Body (@{
    clientId = $client1[0].id
    requestedAmount = 20000
    termMonths = 6
    purpose = 'Originator tracking app 1'
    assignedToUserId = $originator.UserId
  } | ConvertTo-Json)

  $app2 = Invoke-RestMethod -Method Post -Uri 'http://localhost:5080/api/applications' -Headers @{
    Authorization = "Bearer $officerToken"
    'Content-Type' = 'application/json'
  } -Body (@{
    clientId = $client2[0].id
    requestedAmount = 25000
    termMonths = 8
    purpose = 'Originator tracking app 2'
    assignedToUserId = $originator.UserId
  } | ConvertTo-Json)

  Invoke-RestMethod -Method Post -Uri 'http://localhost:5080/api/tasks' -Headers @{
    Authorization = "Bearer $officerToken"
    'Content-Type' = 'application/json'
  } -Body (@{
    applicationId = $app1.id
    title = 'Collect KYC docs'
    assignedTo = $originator.UserId
  } | ConvertTo-Json) | Out-Null

  Invoke-RestMethod -Method Post -Uri 'http://localhost:5080/api/tasks' -Headers @{
    Authorization = "Bearer $officerToken"
    'Content-Type' = 'application/json'
  } -Body (@{
    applicationId = $app2.id
    title = 'Collect latest statements'
    assignedTo = $originator.UserId
  } | ConvertTo-Json) | Out-Null

  $tasks = Invoke-RestMethod -Method Get -Uri 'http://localhost:5080/api/tasks?assignedToMe=true' -Headers @{
    Authorization = "Bearer $originatorToken"
  }

  $distinctApps = @($tasks | Select-Object -ExpandProperty applicationId -Unique).Count
  $ok = ($tasks.Count -ge 2 -and $distinctApps -ge 2)
  Add-Result 'originator_multi_applicant_task_tracking' $ok ("tasks=" + $tasks.Count + ";apps=" + $distinctApps)
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

$results | ConvertTo-Json -Depth 5 | Set-Content 'prdf-lms/.phase4_verify_originator_tracking.json'
$results | Format-Table -AutoSize | Out-String | Write-Output
