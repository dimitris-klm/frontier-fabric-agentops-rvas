targetScope = 'resourceGroup'

@description('Environment name used for resource naming.')
param environmentName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Azure OpenAI model deployment name.')
param openAiModelName string = 'gpt-5-mini'

@description('Azure OpenAI model version. Must be a non-deprecated version available in the target region.')
param openAiModelVersion string = '2025-08-07'

@description('Azure OpenAI deployment SKU. GA models in most regions require GlobalStandard.')
param openAiSkuName string = 'GlobalStandard'

var tags = {
  environment: environmentName
  project: 'observability-platform'
  'azd-env-name': environmentName
}

// ── User-Assigned Managed Identity ────────────────────────────────────────────

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: '${environmentName}-identity'
  location: location
  tags: tags
}

// ── Monitoring (Log Analytics + Application Insights) ─────────────────────────

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  params: {
    location: location
    environmentName: environmentName
    tags: tags
  }
}

// ── Cosmos DB ─────────────────────────────────────────────────────────────────

module cosmosDb 'modules/cosmos-db.bicep' = {
  name: 'cosmos-db'
  params: {
    location: location
    environmentName: environmentName
    tags: tags
  }
}

// ── Azure AI Services (OpenAI) ────────────────────────────────────────────────

resource cognitiveAccount 'Microsoft.CognitiveServices/accounts@2024-04-01-preview' = {
  name: '${environmentName}-openai'
  location: location
  tags: tags
  kind: 'OpenAI'
  sku: {
    name: 'S0'
  }
  properties: {
    customSubDomainName: '${environmentName}-openai'
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
    }
  }
}

resource openAiDeployment 'Microsoft.CognitiveServices/accounts/deployments@2024-04-01-preview' = {
  parent: cognitiveAccount
  name: openAiModelName
  sku: {
    name: openAiSkuName
    capacity: 30
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: openAiModelName
      version: openAiModelVersion
    }
  }
}

// ── Key Vault ─────────────────────────────────────────────────────────────────

resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: '${environmentName}-kv'
  location: location
  tags: tags
  properties: {
    tenantId: subscription().tenantId
    sku: {
      family: 'A'
      name: 'standard'
    }
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
    // Required by tenant policy; irreversible once enabled.
    enablePurgeProtection: true
    publicNetworkAccess: 'Enabled'
  }
}

// ── Container Apps (Environment, Registry, Apps) ──────────────────────────────

module containerApps 'modules/container-apps.bicep' = {
  name: 'container-apps'
  params: {
    location: location
    environmentName: environmentName
    tags: tags
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    applicationInsightsConnectionString: monitoring.outputs.applicationInsightsConnectionString
    cosmosDbEndpoint: cosmosDb.outputs.cosmosDbEndpoint
    openAiEndpoint: cognitiveAccount.properties.endpoint
    openAiDeploymentName: openAiModelName
    managedIdentityId: managedIdentity.id
    managedIdentityClientId: managedIdentity.properties.clientId
    managedIdentityPrincipalId: managedIdentity.properties.principalId
  }
}

// ── API Management ────────────────────────────────────────────────────────────

module apiManagement 'modules/api-management.bicep' = {
  name: 'api-management'
  params: {
    location: location
    environmentName: environmentName
    tags: tags
    frontendFqdn: containerApps.outputs.frontendFqdn
    backendFqdn: containerApps.outputs.backendFqdn
    agentFqdn: containerApps.outputs.agentFqdn
  }
}

// ── Role Assignments ──────────────────────────────────────────────────────────

// Cosmos DB Data Contributor – allows managed identity to read/write Cosmos data
// Use deterministic name matching the cosmos-db module to avoid BCP120
var cosmosDbAccountName = '${environmentName}-cosmos'
var cosmosDbDataContributorRoleId = '00000000-0000-0000-0000-000000000002'

resource cosmosDbAccountRef 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' existing = {
  name: cosmosDbAccountName
}

resource cosmosDbRoleAssignment 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmosDbAccountRef
  name: guid(cosmosDbAccountName, managedIdentity.id, cosmosDbDataContributorRoleId)
  properties: {
    roleDefinitionId: '${cosmosDbAccountRef.id}/sqlRoleDefinitions/${cosmosDbDataContributorRoleId}'
    principalId: managedIdentity.properties.principalId
    scope: cosmosDbAccountRef.id
  }
  dependsOn: [cosmosDb]
}

// Key Vault Secrets User – allows managed identity to read secrets
var keyVaultSecretsUserRoleDefinitionId = '4633458b-17de-408a-b874-0445c86b69e6'

resource keyVaultRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, managedIdentity.id, keyVaultSecretsUserRoleDefinitionId)
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', keyVaultSecretsUserRoleDefinitionId)
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// Cognitive Services OpenAI User – allows managed identity to call OpenAI
var cognitiveServicesOpenAiUserRoleId = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'

resource openAiRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(cognitiveAccount.id, managedIdentity.id, cognitiveServicesOpenAiUserRoleId)
  scope: cognitiveAccount
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveServicesOpenAiUserRoleId)
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ── Outputs ───────────────────────────────────────────────────────────────────

output AZURE_CONTAINER_REGISTRY_NAME string = containerApps.outputs.containerRegistryName
output AZURE_CONTAINER_REGISTRY_LOGIN_SERVER string = containerApps.outputs.containerRegistryLoginServer
output AZURE_COSMOS_DB_ENDPOINT string = cosmosDb.outputs.cosmosDbEndpoint
output AZURE_KEY_VAULT_NAME string = keyVault.name
output AZURE_OPENAI_ENDPOINT string = cognitiveAccount.properties.endpoint
output AZURE_OPENAI_DEPLOYMENT string = openAiModelName
output APPLICATIONINSIGHTS_CONNECTION_STRING string = monitoring.outputs.applicationInsightsConnectionString
output APPLICATIONINSIGHTS_NAME string = monitoring.outputs.applicationInsightsName
output AZURE_APIM_GATEWAY_URL string = apiManagement.outputs.apimGatewayUrl
output FRONTEND_FQDN string = containerApps.outputs.frontendFqdn
output BACKEND_FQDN string = containerApps.outputs.backendFqdn
output AGENT_FQDN string = containerApps.outputs.agentFqdn
output AZURE_MANAGED_IDENTITY_CLIENT_ID string = managedIdentity.properties.clientId
