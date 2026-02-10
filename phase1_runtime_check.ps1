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

$email = 'phase1check+' + [Guid]::NewGuid().ToString('N').Substring(0, 8) + '@test.local'
$password = 'TempP@ssw0rd!123'

$createUserBody = @{
  email = $email
  password = $password
  email_confirm = $true
  user_metadata = @{ full_name = 'Phase1 Check User' }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/admin/users" -Headers @{
  apikey = $serviceRoleKey
  Authorization = "Bearer $serviceRoleKey"
  'Content-Type' = 'application/json'
} -Body $createUserBody | Out-Null

$signInBody = @{
  email = $email
  password = $password
} | ConvertTo-Json

$tokenResponse = Invoke-RestMethod -Method Post -Uri "$supabaseUrl/auth/v1/token?grant_type=password" -Headers @{
  apikey = $anonKey
  'Content-Type' = 'application/json'
} -Body $signInBody

$token = $tokenResponse.access_token
if ([string]::IsNullOrWhiteSpace($token)) {
  throw 'No access token returned from Supabase sign-in.'
}

$proc = Start-Process dotnet -ArgumentList 'run --project src/PRDF.Lms.Api/PRDF.Lms.Api.csproj --urls http://localhost:5080' -WorkingDirectory 'c:\Users\ThaboMponya\Documents\DEV\loanShark\prdf-lms\backend' -PassThru
Start-Sleep -Seconds 4

try {
  $me = Invoke-RestMethod -Method Get -Uri 'http://localhost:5080/me' -Headers @{ Authorization = "Bearer $token" }
  [pscustomobject]@{
    check = 'supabase_login_and_api_me'
    pass = $true
    email = $email
    meUserId = $me.userId
    meEmail = $me.email
  } | ConvertTo-Json -Depth 4 | Set-Content 'prdf-lms/.phase1_runtime_check.json'
  Get-Content -Raw 'prdf-lms/.phase1_runtime_check.json'
}
finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
