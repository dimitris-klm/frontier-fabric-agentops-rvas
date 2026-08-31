@description('Azure region for all resources.')
param location string

@description('Environment name used for resource naming.')
param environmentName string

@description('Tags to apply to all resources.')
param tags object = {}

@description('FQDN of the frontend Container App.')
param frontendFqdn string

@description('FQDN of the backend Container App.')
param backendFqdn string

@description('FQDN of the agent Container App.')
param agentFqdn string

var apimName = '${environmentName}-apim'

resource apimService 'Microsoft.ApiManagement/service@2023-09-01-preview' = {
  name: apimName
  location: location
  tags: tags
  sku: {
    name: 'Consumption'
    capacity: 0
  }
  properties: {
    publisherEmail: 'admin@${environmentName}.com'
    publisherName: '${environmentName} API Management'
  }
}

// ── Frontend API ──────────────────────────────────────────────────────────────

resource frontendApi 'Microsoft.ApiManagement/service/apis@2023-09-01-preview' = {
  parent: apimService
  name: 'frontend-api'
  properties: {
    displayName: 'Frontend API'
    path: 'frontend'
    protocols: [
      'https'
    ]
    serviceUrl: 'https://${frontendFqdn}'
    subscriptionRequired: false
    apiRevision: '1'
  }
}

resource frontendApiPolicy 'Microsoft.ApiManagement/service/apis/policies@2023-09-01-preview' = {
  parent: frontendApi
  name: 'policy'
  properties: {
    format: 'xml'
    value: '<policies><inbound><base /><set-backend-service base-url="https://${frontendFqdn}" /><cors allow-credentials="false"><allowed-origins><origin>*</origin></allowed-origins><allowed-methods preflight-result-max-age="300"><method>GET</method><method>POST</method><method>PUT</method><method>DELETE</method><method>OPTIONS</method></allowed-methods><allowed-headers><header>*</header></allowed-headers></cors></inbound><backend><base /></backend><outbound><base /></outbound><on-error><base /></on-error></policies>'
  }
}

resource frontendGetAll 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: frontendApi
  name: 'frontend-get-all'
  properties: {
    displayName: 'Proxy all GET requests'
    method: 'GET'
    urlTemplate: '/*'
  }
}

resource frontendPostAll 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: frontendApi
  name: 'frontend-post-all'
  properties: {
    displayName: 'Proxy all POST requests'
    method: 'POST'
    urlTemplate: '/*'
  }
}

// ── Backend API ───────────────────────────────────────────────────────────────

resource backendApi 'Microsoft.ApiManagement/service/apis@2023-09-01-preview' = {
  parent: apimService
  name: 'backend-api'
  properties: {
    displayName: 'Backend API'
    path: 'api'
    protocols: [
      'https'
    ]
    serviceUrl: 'https://${backendFqdn}'
    subscriptionRequired: false
    apiRevision: '1'
  }
}

resource backendApiPolicy 'Microsoft.ApiManagement/service/apis/policies@2023-09-01-preview' = {
  parent: backendApi
  name: 'policy'
  properties: {
    format: 'xml'
    value: '<policies><inbound><base /><set-backend-service base-url="https://${backendFqdn}" /><cors allow-credentials="false"><allowed-origins><origin>*</origin></allowed-origins><allowed-methods preflight-result-max-age="300"><method>GET</method><method>POST</method><method>PUT</method><method>DELETE</method><method>OPTIONS</method></allowed-methods><allowed-headers><header>*</header></allowed-headers></cors></inbound><backend><base /></backend><outbound><base /></outbound><on-error><base /></on-error></policies>'
  }
}

resource backendGetAll 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: backendApi
  name: 'backend-get-all'
  properties: {
    displayName: 'Proxy all GET requests'
    method: 'GET'
    urlTemplate: '/*'
  }
}

resource backendPostAll 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: backendApi
  name: 'backend-post-all'
  properties: {
    displayName: 'Proxy all POST requests'
    method: 'POST'
    urlTemplate: '/*'
  }
}

resource backendPutAll 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: backendApi
  name: 'backend-put-all'
  properties: {
    displayName: 'Proxy all PUT requests'
    method: 'PUT'
    urlTemplate: '/*'
  }
}

resource backendDeleteAll 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: backendApi
  name: 'backend-delete-all'
  properties: {
    displayName: 'Proxy all DELETE requests'
    method: 'DELETE'
    urlTemplate: '/*'
  }
}

// ── Agent API ─────────────────────────────────────────────────────────────────

resource agentApi 'Microsoft.ApiManagement/service/apis@2023-09-01-preview' = {
  parent: apimService
  name: 'agent-api'
  properties: {
    displayName: 'Agent API'
    path: 'agent'
    protocols: [
      'https'
    ]
    serviceUrl: 'https://${agentFqdn}'
    subscriptionRequired: false
    apiRevision: '1'
  }
}

resource agentApiPolicy 'Microsoft.ApiManagement/service/apis/policies@2023-09-01-preview' = {
  parent: agentApi
  name: 'policy'
  properties: {
    format: 'xml'
    value: '<policies><inbound><base /><set-backend-service base-url="https://${agentFqdn}" /><cors allow-credentials="false"><allowed-origins><origin>*</origin></allowed-origins><allowed-methods preflight-result-max-age="300"><method>GET</method><method>POST</method><method>PUT</method><method>DELETE</method><method>OPTIONS</method></allowed-methods><allowed-headers><header>*</header></allowed-headers></cors></inbound><backend><base /></backend><outbound><base /></outbound><on-error><base /></on-error></policies>'
  }
}

resource agentGetAll 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: agentApi
  name: 'agent-get-all'
  properties: {
    displayName: 'Proxy all GET requests'
    method: 'GET'
    urlTemplate: '/*'
  }
}

resource agentPostAll 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: agentApi
  name: 'agent-post-all'
  properties: {
    displayName: 'Proxy all POST requests'
    method: 'POST'
    urlTemplate: '/*'
  }
}

resource agentPutAll 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: agentApi
  name: 'agent-put-all'
  properties: {
    displayName: 'Proxy all PUT requests'
    method: 'PUT'
    urlTemplate: '/*'
  }
}

resource agentDeleteAll 'Microsoft.ApiManagement/service/apis/operations@2023-09-01-preview' = {
  parent: agentApi
  name: 'agent-delete-all'
  properties: {
    displayName: 'Proxy all DELETE requests'
    method: 'DELETE'
    urlTemplate: '/*'
  }
}

@description('API Management service name.')
output apimName string = apimService.name

@description('API Management gateway URL.')
output apimGatewayUrl string = apimService.properties.gatewayUrl
