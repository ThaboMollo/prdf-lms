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
  $assignBody = @{ user_id = $userId; role_id = $roleRows[0].id } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/user_roles" -Headers @{
    apikey = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
    'Content-Type' = 'application/json'
    Prefer = 'return=minimal'
  } -Body $assignBody | Out-Null
}

function Sign-In($email) {
  $token = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/token?grant_type=password" -Headers @{
    apikey = $anonKey
    'Content-Type' = 'application/json'
  } -Body (@{ email = $email; password = $password } | ConvertTo-Json)
  return $token.access_token
}

$officer = New-User 'phase56officer' 'Phase56 Officer'
$clientUser = New-User 'phase56client' 'Phase56 Client'
Assign-Role $officer.UserId 'LoanOfficer'
Assign-Role $clientUser.UserId 'Client'

Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/profiles" -Headers @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  'Content-Type' = 'application/json'
  Prefer = 'return=minimal'
} -Body (@{ user_id = $clientUser.UserId; full_name = 'Phase56 Client'; phone = $null } | ConvertTo-Json) | Out-Null

$clientEntity = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/clients?select=id" -Headers @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  'Content-Type' = 'application/json'
  Prefer = 'return=representation'
} -Body (@{
  user_id = $clientUser.UserId
  business_name = 'Phase56 Client Biz'
  registration_no = 'REG-P56-001'
  address = 'Phase56 Address'
} | ConvertTo-Json)

$officerToken = Sign-In $officer.Email
$clientToken = Sign-In $clientUser.Email

$proc = Start-Process dotnet -ArgumentList 'run --project src/PRDF.Lms.Api/PRDF.Lms.Api.csproj --urls http://localhost:5080' -WorkingDirectory 'c:\Users\ThaboMponya\Documents\DEV\loanShark\prdf-lms\backend' -PassThru
Start-Sleep -Seconds 6

$results = @()
function Add-Result($name, $ok, $detail) {
  $script:results += [pscustomobject]@{ check = $name; pass = $ok; detail = $detail }
}
function ErrorDetail($err) {
  try {
    if ($err.Exception.Response -and $err.Exception.Response.GetResponseStream) {
      $reader = New-Object System.IO.StreamReader($err.Exception.Response.GetResponseStream())
      return $reader.ReadToEnd()
    }
  } catch {}
  return $err.Exception.Message
}

$appId = $null
$docId = $null
try {
  try {
    $created = Invoke-RestMethod -Method Post -Uri 'http://localhost:5080/api/applications' -Headers @{
      Authorization = "Bearer $officerToken"
      'Content-Type' = 'application/json'
    } -Body (@{
      clientId = $clientEntity[0].id
      requestedAmount = 40000
      termMonths = 12
      purpose = 'Phase56 verification'
    } | ConvertTo-Json)
    $appId = $created.id
    Add-Result 'create_application' $true $appId
  } catch { Add-Result 'create_application' $false (ErrorDetail $_) }

  if ($appId) {
    try {
      Invoke-RestMethod -Method Post -Uri "http://localhost:5080/api/applications/$appId/submit" -Headers @{
        Authorization = "Bearer $officerToken"; 'Content-Type' = 'application/json'
      } -Body (@{ note = 'Submit for phase56' } | ConvertTo-Json) | Out-Null
      Add-Result 'submit_application' $true 'Submitted'
    } catch { Add-Result 'submit_application' $false (ErrorDetail $_) }

    try {
      Invoke-RestMethod -Method Post -Uri 'http://localhost:5080/api/document-requirements' -Headers @{
        Authorization = "Bearer $officerToken"; 'Content-Type' = 'application/json'
      } -Body (@{
        loanProductId = $null
        requiredAtStatus = 'Submitted'
        docType = 'BankStatement'
        isRequired = $true
      } | ConvertTo-Json) | Out-Null

      $reqs = Invoke-RestMethod -Method Get -Uri 'http://localhost:5080/api/document-requirements' -Headers @{ Authorization = "Bearer $officerToken" }
      Add-Result 'document_requirements_api' ($reqs.Count -ge 1) ("count=" + $reqs.Count)
    } catch { Add-Result 'document_requirements_api' $false (ErrorDetail $_) }

    try {
      $doc = Invoke-RestMethod -Method Post -Uri "http://localhost:5080/api/applications/$appId/documents/confirm" -Headers @{
        Authorization = "Bearer $officerToken"; 'Content-Type' = 'application/json'
      } -Body (@{
        docType = 'BankStatement'
        storagePath = "applications/$appId/manual-bank-statement.pdf"
        status = 'Pending'
      } | ConvertTo-Json)
      $docId = $doc.id

      Invoke-RestMethod -Method Post -Uri "http://localhost:5080/api/applications/$appId/documents/$docId/verify" -Headers @{
        Authorization = "Bearer $officerToken"; 'Content-Type' = 'application/json'
      } -Body (@{
        status = 'Verified'
        note = 'Verified by officer'
      } | ConvertTo-Json) | Out-Null
      Add-Result 'document_verification_workflow' $true $docId
    } catch { Add-Result 'document_verification_workflow' $false (ErrorDetail $_) }

    try {
      Invoke-RestMethod -Method Post -Uri "http://localhost:5080/api/tasks" -Headers @{
        Authorization = "Bearer $officerToken"; 'Content-Type' = 'application/json'
      } -Body (@{
        applicationId = $appId
        title = 'Due reminder task'
        assignedTo = $clientUser.UserId
        dueDate = (Get-Date).ToString('yyyy-MM-dd')
      } | ConvertTo-Json) | Out-Null
      Add-Result 'create_due_task_for_reminder' $true 'ok'
    } catch { Add-Result 'create_due_task_for_reminder' $false (ErrorDetail $_) }
  }

  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 2
  $proc = Start-Process dotnet -ArgumentList 'run --project src/PRDF.Lms.Api/PRDF.Lms.Api.csproj --urls http://localhost:5080' -WorkingDirectory 'c:\Users\ThaboMponya\Documents\DEV\loanShark\prdf-lms\backend' -PassThru
  Start-Sleep -Seconds 8

  try {
    $notifs = Invoke-RestMethod -Method Get -Uri 'http://localhost:5080/api/notifications?unreadOnly=true' -Headers @{ Authorization = "Bearer $clientToken" }
    $hasStatusOrReminder = $notifs | Where-Object { $_.type -in @('ApplicationStatusChanged', 'TaskReminder', 'StaleApplicationFollowUp') }
    Add-Result 'in_app_notifications' ($hasStatusOrReminder.Count -ge 1) ("count=" + $notifs.Count)
  } catch { Add-Result 'in_app_notifications' $false (ErrorDetail $_) }

  try {
    $audit = Invoke-RestMethod -Method Get -Uri 'http://localhost:5080/api/reports/audit?limit=50' -Headers @{ Authorization = "Bearer $officerToken" }
    Add-Result 'admin_audit_report' ($audit.Count -ge 1) ("count=" + $audit.Count)
  } catch { Add-Result 'admin_audit_report' $false (ErrorDetail $_) }

  try {
    $turnaround = Invoke-RestMethod -Method Get -Uri 'http://localhost:5080/api/reports/turnaround' -Headers @{ Authorization = "Bearer $officerToken" }
    $pipeline = Invoke-RestMethod -Method Get -Uri 'http://localhost:5080/api/reports/pipeline-conversion' -Headers @{ Authorization = "Bearer $officerToken" }
    $productivity = Invoke-RestMethod -Method Get -Uri 'http://localhost:5080/api/reports/productivity' -Headers @{ Authorization = "Bearer $officerToken" }
    Add-Result 'management_reports' $true ("turnaroundCount=" + $turnaround.count + ";pipeline=" + $pipeline.Count + ";productivity=" + $productivity.Count)
  } catch { Add-Result 'management_reports' $false (ErrorDetail $_) }
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}

$results | ConvertTo-Json -Depth 5 | Set-Content 'prdf-lms/.phase5_6_verify_results.json'
$results | Format-Table -AutoSize | Out-String | Write-Output
