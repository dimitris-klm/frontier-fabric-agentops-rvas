# Agent Workload Deployment Playbook

This playbook deploys the agent workload into a completely new Azure resource group. It provisions the infrastructure first, builds the three application images remotely in Azure Container Registry (ACR), and then updates the Azure Container Apps (ACA) with those images.

> [!IMPORTANT]
> **`azd up` did not work on the Microsoft-managed network because its local Docker builds could reach `pypi.org` but could not complete TLS downloads from `files.pythonhosted.org`. We therefore split deployment into `azd provision`, remote `az acr build` commands, and explicit `az containerapp update` commands.**

## Prerequisites

Before starting, confirm that the following prerequisites are available:

- Azure CLI (`az`)
- Azure Developer CLI (`azd`)
- Docker Desktop, with the Docker engine running
- Access to the target Azure subscription
- Permission to create resource groups, deployments, role assignments, and the resources defined by the Bicep templates
- The required Azure resource providers registered in the subscription
- A PowerShell terminal

Docker Desktop must be running even though this playbook builds images remotely. With the current [`azure.yaml`](resources/agent-workload/azure.yaml), `azd provision` checks the local Docker runtime because all three services declare Docker-based packaging.

Run the playbook from:

```text
C:\Users\dkalamaras\Documents\Repos\frontier-fabric-agentops-rvas\resources\agent-workload
```

Use a new environment name as well as a new resource group. The environment name is used to create resource names, including globally scoped ACR, Key Vault, Cosmos DB, and Azure OpenAI names.

## 1. Set Deployment Variables

```powershell
Set-Location 'C:\Users\dkalamaras\Documents\Repos\frontier-fabric-agentops-rvas\resources\agent-workload'

$SubscriptionId = '5d5d25ff-7493-4644-9e84-ae90d5fded3a'
$Location = 'swedencentral'
$EnvironmentName = 'ctl-tower-v2'
$ResourceGroup = "rg-$EnvironmentName"
$ImageTag = 'deploy-latest'
```

Change `$EnvironmentName` for each clean deployment. Keep it relatively short because it is included in resource names.

## 2. Authenticate and Select the Subscription

```powershell
az login
az account set --subscription $SubscriptionId
azd auth login
az account show --query '{subscription:name, subscriptionId:id, tenantId:tenantId, user:user.name}' --output table
```

Verify that the displayed subscription and tenant are correct before continuing.

## 3. Create the New `azd` Environment

```powershell
azd env new $EnvironmentName
azd env set AZURE_SUBSCRIPTION_ID $SubscriptionId
azd env set AZURE_LOCATION $Location
azd env set AZURE_RESOURCE_GROUP $ResourceGroup
azd env get-values
```

Confirm that `AZURE_ENV_NAME`, `AZURE_LOCATION`, `AZURE_RESOURCE_GROUP`, and `AZURE_SUBSCRIPTION_ID` contain the intended values.

## 4. Validate the Bicep Template

```powershell
az bicep build --file '.\infra\main.bicep' --stdout > $null
```

The command should complete with exit code `0` and no Bicep errors or warnings.

## 5. Provision the Azure Infrastructure

Ensure Docker Desktop is running, and then execute:

```powershell
azd provision
```

This provisions the infrastructure with placeholder Container App images. It does not deploy the application code.

Confirm that the new resource group exists:

```powershell
az group show --name $ResourceGroup --query '{name:name, location:location, state:properties.provisioningState}' --output table
az resource list --resource-group $ResourceGroup --query '[].{Name:name, Type:type, Location:location}' --output table
```

## 6. Discover the Azure Container Registry

```powershell
$AcrName = az acr list --resource-group $ResourceGroup --query '[0].name' --output tsv
$AcrLoginServer = az acr show --name $AcrName --query loginServer --output tsv

Write-Host "Environment:    $EnvironmentName"
Write-Host "Resource group: $ResourceGroup"
Write-Host "ACR:            $AcrName"
Write-Host "Login server:   $AcrLoginServer"
Write-Host "Image tag:      $ImageTag"
```

Do not continue if `$AcrName` or `$AcrLoginServer` is empty.

## 7. Build the Agent Image in ACR

```powershell
az acr build --registry $AcrName --image "agent:$ImageTag" --file '.\src\agent\Dockerfile' '.\src\agent'
```

## 8. Build the Backend Image in ACR

```powershell
az acr build --registry $AcrName --image "backend:$ImageTag" --file '.\src\backend\Dockerfile' '.\src\backend'
```

The backend image includes the required `aiohttp==3.11.11` dependency.

## 9. Build the Frontend Image in ACR

```powershell
az acr build --registry $AcrName --image "frontend:$ImageTag" --file '.\src\frontend\Dockerfile' '.\src\frontend'
```

The frontend resolves its backend URL at runtime through `/api/config`; no backend URL build argument is required.

> [!NOTE]
> During this build, `npm ci` is expected to print an `EUSAGE` error stating that it requires an existing `package-lock.json`. The frontend currently has no lock file, and its Dockerfile deliberately uses `RUN npm ci || npm install`. The failed `npm ci` command therefore falls back immediately to `npm install`, so this message alone does not fail the image build. It is non-blocking when `npm install` and `npm run build` subsequently succeed and the ACR run finishes with status `Succeeded`. Investigate only if the fallback also fails, the ACR command returns a nonzero exit code, or the expected frontend image tag is absent.

## 10. Confirm That All Images Exist

```powershell
az acr repository show-tags --name $AcrName --repository agent --output table
az acr repository show-tags --name $AcrName --repository backend --output table
az acr repository show-tags --name $AcrName --repository frontend --output table
```

Confirm that `$ImageTag` appears in all three repositories.

## 11. Set the Container App Names

```powershell
$AgentApp = "$EnvironmentName-agent"
$BackendApp = "$EnvironmentName-backend"
$FrontendApp = "$EnvironmentName-frontend"
```

## 12. Deploy the Agent Image

```powershell
az containerapp update --resource-group $ResourceGroup --name $AgentApp --image "${AcrLoginServer}/agent:${ImageTag}"
```

## 13. Deploy the Backend Image

```powershell
az containerapp update --resource-group $ResourceGroup --name $BackendApp --image "${AcrLoginServer}/backend:${ImageTag}"
```

## 14. Deploy the Frontend Image

```powershell
az containerapp update --resource-group $ResourceGroup --name $FrontendApp --image "${AcrLoginServer}/frontend:${ImageTag}"
```

The agent is updated first so that the backend can reach a real agent revision when it starts. The frontend is updated last.

## 15. Verify the Deployed Images and Revisions

```powershell
az containerapp show --resource-group $ResourceGroup --name $AgentApp --query '{image:properties.template.containers[0].image, latestRevision:properties.latestRevisionName, readyRevision:properties.latestReadyRevisionName}' --output table
az containerapp show --resource-group $ResourceGroup --name $BackendApp --query '{image:properties.template.containers[0].image, latestRevision:properties.latestRevisionName, readyRevision:properties.latestReadyRevisionName}' --output table
az containerapp show --resource-group $ResourceGroup --name $FrontendApp --query '{image:properties.template.containers[0].image, latestRevision:properties.latestRevisionName, readyRevision:properties.latestReadyRevisionName}' --output table
```

For each app, verify that the image contains `$ImageTag` and that `latestRevision` matches `readyRevision`.

## 16. Resolve the Application URLs

```powershell
$AgentFqdn = az containerapp show --resource-group $ResourceGroup --name $AgentApp --query properties.configuration.ingress.fqdn --output tsv
$BackendFqdn = az containerapp show --resource-group $ResourceGroup --name $BackendApp --query properties.configuration.ingress.fqdn --output tsv
$FrontendFqdn = az containerapp show --resource-group $ResourceGroup --name $FrontendApp --query properties.configuration.ingress.fqdn --output tsv

$AgentUrl = "https://$AgentFqdn"
$BackendUrl = "https://$BackendFqdn"
$FrontendUrl = "https://$FrontendFqdn"

Write-Host "Agent:   $AgentUrl"
Write-Host "Backend: $BackendUrl"
Write-Host "Frontend: $FrontendUrl"
```

## 17. Run Health Checks

```powershell
Invoke-RestMethod -Uri "$AgentUrl/api/health"
Invoke-RestMethod -Uri "$BackendUrl/api/health"
Invoke-WebRequest -Uri $FrontendUrl -UseBasicParsing | Select-Object StatusCode
```

Expected results:

- Agent: `status = healthy`, `service = agent`
- Backend: `status = healthy`, `service = backend`
- Frontend: HTTP `200`

The first request can take longer while a new revision becomes ready.

## 18. Open and Test the Application

```powershell
Start-Process $FrontendUrl
```

Create a conversation and send `Hi`. This validates the complete request path:

```text
Frontend -> Backend -> Cosmos DB -> Agent -> Azure OpenAI
```

## 19. Diagnose Failed Revisions

If a service does not become healthy, inspect its revisions:

```powershell
az containerapp revision list --resource-group $ResourceGroup --name $AgentApp --query '[].{Name:name, Active:properties.active, Health:properties.healthState, State:properties.runningState}' --output table
az containerapp revision list --resource-group $ResourceGroup --name $BackendApp --query '[].{Name:name, Active:properties.active, Health:properties.healthState, State:properties.runningState}' --output table
az containerapp revision list --resource-group $ResourceGroup --name $FrontendApp --query '[].{Name:name, Active:properties.active, Health:properties.healthState, State:properties.runningState}' --output table
```

Inspect backend system and application logs:

```powershell
az containerapp logs show --resource-group $ResourceGroup --name $BackendApp --type system --tail 50
az containerapp logs show --resource-group $ResourceGroup --name $BackendApp --type console --tail 50
```

Replace `$BackendApp` with `$AgentApp` or `$FrontendApp` to inspect another service.

## Subsequent Application Deployments

After real images have been attached, do not rerun `azd provision` casually. The Bicep module currently defines this placeholder image:

```text
mcr.microsoft.com/k8se/quickstart:latest
```

A subsequent infrastructure deployment could restore the placeholder image configuration. For later application releases, create a new immutable image tag and repeat the relevant `az acr build` and `az containerapp update` commands.
