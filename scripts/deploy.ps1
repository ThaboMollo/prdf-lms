param(
  [Parameter(Mandatory = $true)]
  [string]$Environment,
  [Parameter(Mandatory = $false)]
  [string]$ApiImageTag = "latest"
)

$ErrorActionPreference = "Stop"

Write-Host "Deploying PRDF LMS to environment: $Environment"
Write-Host "API image tag: $ApiImageTag"

Write-Host ""
Write-Host "Step 1: Build and push API image (example)"
Write-Host "  docker build -t prdflms-api:$ApiImageTag ./backend/src/PRDF.Lms.Api"
Write-Host "  docker tag prdflms-api:$ApiImageTag <registry>/prdflms-api:$ApiImageTag"
Write-Host "  docker push <registry>/prdflms-api:$ApiImageTag"

Write-Host ""
Write-Host "Step 2: Deploy API container (Azure Container Apps example)"
Write-Host "  az containerapp update --name prdf-lms-api-$Environment --image <registry>/prdflms-api:$ApiImageTag"

Write-Host ""
Write-Host "Step 3: Deploy frontend (Vercel/Netlify)"
Write-Host "  vercel --prod --yes"

Write-Host ""
Write-Host "Step 4: Post-deploy checks"
Write-Host "  curl https://<api-host>/health"
Write-Host "  Check GitHub Action 'Uptime Check'"
