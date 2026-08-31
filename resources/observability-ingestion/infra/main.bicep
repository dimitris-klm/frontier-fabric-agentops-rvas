targetScope = 'resourceGroup'

@description('Environment name used as a prefix for all resources.')
@minLength(1)
@maxLength(12)
param environmentName string

@description('Azure region for all resources.')
param location string = resourceGroup().location

@description('Name of the existing Log Analytics workspace created by the agent workload.')
param logAnalyticsWorkspaceName string

@description('Principal ID of the Fabric workspace identity used to access observability data.')
param fabricWorkspaceIdentityPrincipalId string

var resourceToken = toLower(uniqueString(resourceGroup().id, environmentName))
var storageAccountName = 'st${replace(resourceToken, '-', '')}obs'
var costExportName = 'export-${environmentName}-focus-daily'

var tags = {
  environment: environmentName
  project: 'observability-platform'
  demo: 'demo-2-ingestion'
}

// ─── Storage Account (ADLS Gen2) ─────────────────────────────────────────────

module storage 'modules/storage.bicep' = {
  name: 'storageDeployment'
  params: {
    storageAccountName: storageAccountName
    location: location
    tags: tags
    fabricWorkspaceIdentityPrincipalId: fabricWorkspaceIdentityPrincipalId
  }
}

// ─── Log Analytics Workspace ─────────────────────────────────────────────────

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoringDeployment'
  params: {
    workspaceName: logAnalyticsWorkspaceName
    storageAccountId: storage.outputs.storageAccountId
  }
}

// ─── Diagnostic Settings on Log Analytics Workspace ──────────────────────────

module diagnosticSettings 'modules/diagnostic-settings.bicep' = {
  name: 'diagnosticSettingsDeployment'
  params: {
    diagnosticSettingName: 'diag-${logAnalyticsWorkspaceName}'
    targetWorkspaceName: monitoring.outputs.workspaceName
    workspaceId: monitoring.outputs.workspaceId
    storageAccountId: storage.outputs.storageAccountId
  }
}

// ─── Cost Management Export (Subscription Scope) ─────────────────────────────

module costExport 'modules/cost-export.bicep' = {
  name: 'costExportDeployment'
  scope: subscription()
  params: {
    exportName: costExportName
    storageAccountId: storage.outputs.storageAccountId
  }
}

// ─── Outputs ─────────────────────────────────────────────────────────────────

output AZURE_STORAGE_ACCOUNT_NAME string = storage.outputs.storageAccountName
output AZURE_STORAGE_ACCOUNT_ID string = storage.outputs.storageAccountId
output AZURE_LOG_ANALYTICS_WORKSPACE_NAME string = monitoring.outputs.workspaceName
output AZURE_LOG_ANALYTICS_WORKSPACE_ID string = monitoring.outputs.workspaceId
