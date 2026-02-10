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

function New-User($emailPrefix, $fullName, $password) {
  $email = $emailPrefix + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '@example.com'
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
  $roleId = $roleRows[0].id
  $assignRoleBody = @{ user_id = $userId; role_id = $roleId } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/user_roles" -Headers @{
    apikey = $serviceRoleKey
    Authorization = "Bearer $serviceRoleKey"
    'Content-Type' = 'application/json'
    Prefer = 'return=minimal'
  } -Body $assignRoleBody | Out-Null
}

function Sign-In($email, $password) {
  $signInBody = @{ email = $email; password = $password } | ConvertTo-Json
  $tokenResponse = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/token?grant_type=password" -Headers @{
    apikey = $anonKey
    'Content-Type' = 'application/json'
  } -Body $signInBody
  return $tokenResponse.access_token
}

$password = 'TempP@ssw0rd!123'
$officer = New-User 'phase4officer' 'Phase4 Officer' $password
$clientUser = New-User 'phase4client' 'Phase4 Client' $password

Assign-Role $officer.UserId 'LoanOfficer'
Assign-Role $clientUser.UserId 'Client'

$profileBody = @{
  user_id = $clientUser.UserId
  full_name = 'Phase4 Client'
  phone = $null
} | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/profiles" -Headers @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  'Content-Type' = 'application/json'
  Prefer = 'return=minimal'
} -Body $profileBody | Out-Null

$clientEntityBody = @{
  user_id = $clientUser.UserId
  business_name = 'Phase4 Client Business'
  registration_no = 'REG-P4-TASK-001'
  address = 'Phase4 Address'
} | ConvertTo-Json
$clientEntity = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/rest/v1/clients?select=id" -Headers @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  'Content-Type' = 'application/json'
  Prefer = 'return=representation'
} -Body $clientEntityBody
$clientId = $clientEntity[0].id

$officerToken = Sign-In $officer.Email $password
$clientToken = Sign-In $clientUser.Email $password

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
  $appBody = @{
    clientId = $clientId
    requestedAmount = 30000
    termMonths = 10
    purpose = 'Phase4 task flow'
  } | ConvertTo-Json

  $appId = $null
  try {
    $created = Invoke-RestMethod -Method Post -Uri 'http://localhost:5080/api/applications' -Headers @{
      Authorization = "Bearer $officerToken"
      'Content-Type' = 'application/json'
    } -Body $appBody
    $appId = $created.id
    Add-Result 'create_application' $true $appId
  } catch { Add-Result 'create_application' $false (ErrorDetail $_) }

  $taskId = $null
  if ($appId) {
    try {
      Invoke-RestMethod -Method Post -Uri "http://localhost:5080/api/applications/$appId/submit" -Headers @{
        Authorization = "Bearer $officerToken"
        'Content-Type' = 'application/json'
      } -Body (@{ note = 'Submit for info request flow' } | ConvertTo-Json) | Out-Null
      Add-Result 'submit_application' $true 'Submitted'
    } catch { Add-Result 'submit_application' $false (ErrorDetail $_) }

    try {
      Invoke-RestMethod -Method Post -Uri "http://localhost:5080/api/applications/$appId/status" -Headers @{
        Authorization = "Bearer $officerToken"
        'Content-Type' = 'application/json'
      } -Body (@{ toStatus = 'InfoRequested'; note = 'Need updated bank statement' } | ConvertTo-Json) | Out-Null
      Add-Result 'info_requested_status' $true 'ok'
    } catch { Add-Result 'info_requested_status' $false (ErrorDetail $_) }

    try {
      $tasks = Invoke-RestMethod -Method Get -Uri "http://localhost:5080/api/tasks?applicationId=$appId&assignedToMe=true" -Headers @{
        Authorization = "Bearer $clientToken"
      }
      if ($tasks.Count -gt 0) {
        $taskId = $tasks[0].id
        Add-Result 'client_receives_info_request_task' $true $taskId
      } else {
        Add-Result 'client_receives_info_request_task' $false 'no tasks'
      }
    } catch { Add-Result 'client_receives_info_request_task' $false (ErrorDetail $_) }

    if ($taskId) {
      try {
        Invoke-RestMethod -Method Post -Uri "http://localhost:5080/api/tasks/$taskId/complete" -Headers @{
          Authorization = "Bearer $clientToken"
          'Content-Type' = 'application/json'
        } -Body (@{ note = 'Uploaded requested documents.' } | ConvertTo-Json) | Out-Null
        Add-Result 'client_completes_task' $true 'Completed'
      } catch { Add-Result 'client_completes_task' $false (ErrorDetail $_) }
    }

    try {
      $manualTask = Invoke-RestMethod -Method Post -Uri 'http://localhost:5080/api/tasks' -Headers @{
        Authorization = "Bearer $officerToken"
        'Content-Type' = 'application/json'
      } -Body (@{
        applicationId = $appId
        title = 'Manual follow-up task'
        assignedTo = $officer.UserId
        dueDate = '2030-01-01'
      } | ConvertTo-Json)
      Add-Result 'task_create' $true $manualTask.id

      $updatedTask = Invoke-RestMethod -Method Put -Uri "http://localhost:5080/api/tasks/$($manualTask.id)" -Headers @{
        Authorization = "Bearer $officerToken"
        'Content-Type' = 'application/json'
      } -Body (@{
        title = 'Manual follow-up task updated'
        assignedTo = $officer.UserId
        dueDate = '2030-02-01'
      } | ConvertTo-Json)
      Add-Result 'task_update_assign_due' $true $updatedTask.title
    } catch { Add-Result 'task_create_update' $false (ErrorDetail $_) }

    try {
      Invoke-RestMethod -Method Post -Uri "http://localhost:5080/api/applications/$appId/notes" -Headers @{
        Authorization = "Bearer $officerToken"
        'Content-Type' = 'application/json'
      } -Body (@{ body = 'Officer note for timeline.' } | ConvertTo-Json) | Out-Null

      $notes = Invoke-RestMethod -Method Get -Uri "http://localhost:5080/api/applications/$appId/notes" -Headers @{
        Authorization = "Bearer $clientToken"
      }

      if ($notes.Count -ge 1) {
        Add-Result 'notes_timeline' $true ("count=" + $notes.Count)
      } else {
        Add-Result 'notes_timeline' $false 'no notes'
      }
    } catch { Add-Result 'notes_timeline' $false (ErrorDetail $_) }
  }

  $results | ConvertTo-Json -Depth 5 | Set-Content 'prdf-lms/.phase4_verify_tasks_notes.json'
  $results | Format-Table -AutoSize | Out-String | Write-Output
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
