targetScope = 'subscription'

@description('Name of the cost export.')
param exportName string

@description('Resource ID of the destination storage account.')
param storageAccountId string

resource costExport 'Microsoft.CostManagement/exports@2025-03-01' = {
  name: exportName
  properties: {
    definition: {
      type: 'FocusCost'
      timeframe: 'MonthToDate'
    }
    deliveryInfo: {
      destination: {
        resourceId: storageAccountId
        container: 'costs'
        rootFolderPath: 'focus'
      }
    }
    format: 'Parquet'
    partitionData: true
    schedule: {
      status: 'Active'
      recurrence: 'Daily'
      recurrencePeriod: {
        from: '2024-01-01T00:00:00Z'
        to: '2034-12-31T23:59:59Z'
      }
    }
  }
}

@description('The name of the cost export.')
output exportResourceName string = costExport.name
