@description('Name for the diagnostic setting.')
param diagnosticSettingName string

@description('Name of the Log Analytics workspace to attach diagnostic settings to.')
param targetWorkspaceName string

@description('Resource ID of the Log Analytics workspace for log destination.')
param workspaceId string

@description('Resource ID of the destination storage account.')
param storageAccountId string

resource targetWorkspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: targetWorkspaceName
}

resource diagnosticSetting 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = {
  name: diagnosticSettingName
  scope: targetWorkspace
  properties: {
    storageAccountId: storageAccountId
    workspaceId: workspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

@description('The name of the diagnostic setting.')
output diagnosticSettingName string = diagnosticSetting.name
