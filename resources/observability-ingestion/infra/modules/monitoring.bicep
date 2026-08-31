@description('Name of the Log Analytics workspace.')
param workspaceName string

@description('Resource ID of the destination storage account for data export.')
param storageAccountId string

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: workspaceName
}

resource dataExportRule 'Microsoft.OperationalInsights/workspaces/dataExports@2020-08-01' = {
  parent: workspace
  name: 'exportToStorage'
  properties: {
    destination: {
      resourceId: storageAccountId
    }
    tableNames: [
      'AppRequests'
      'AppDependencies'
      'AppTraces'
      'AppExceptions'
      'AppMetrics'
    ]
    enable: true
  }
}

@description('The resource ID of the Log Analytics workspace.')
output workspaceId string = workspace.id

@description('The name of the Log Analytics workspace.')
output workspaceName string = workspace.name

@description('The customer ID (workspace ID GUID) for the Log Analytics workspace.')
output workspaceCustomerId string = workspace.properties.customerId
