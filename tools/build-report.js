// Generates the PBIR definition for the Observability Analytics report from _brief/report-spec.md.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'powerbi', 'Observability Analytics Report.Report');
const DEF = path.join(ROOT, 'definition');

const MODEL_ID = 'feea7d92-f707-47aa-8e9d-fc8bfe89f5ed';
const LOGICAL_ID = '7f3c1d92-4b8e-46a1-9c05-2e6b8d51a7f4';
const THEME = 'ObservabilityControlTower';

const S = {
  defProps: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/1.0.0/schema.json',
  platform: 'https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json',
  version: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json',
  report: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/2.0.0/schema.json',
  pages: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json',
  page: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json',
  visual: 'https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.0.0/schema.json',
  theme: 'https://raw.githubusercontent.com/microsoft/powerbi-desktop-samples/main/Report%20Theme%20JSON%20Schema/reportThemeSchema-2.140.json',
};

const C = {
  canvas: '#F4F7F9', text: '#17212B',
  reliability: '#007C91', latency: '#D97706', availability: '#2E7D32',
  cost: '#1D4ED8', performance: '#7C3AED', alert: '#C62828',
};

const str = (v) => ({ expr: { Literal: { Value: `'${v}'` } } });
const bool = (v) => ({ expr: { Literal: { Value: v ? 'true' : 'false' } } });
const num = (v) => ({ expr: { Literal: { Value: `${v}D` } } });
const solid = (hex) => ({ solid: { color: { expr: { Literal: { Value: `'${hex}'` } } } } });

const column = (entity, property) => ({
  field: { Column: { Expression: { SourceRef: { Entity: entity } }, Property: property } },
  queryRef: `${entity}.${property}`,
  nativeQueryRef: property,
});

const measure = (entity, property) => ({
  field: { Measure: { Expression: { SourceRef: { Entity: entity } }, Property: property } },
  queryRef: `${entity}.${property}`,
  nativeQueryRef: property,
});

const pos = (x, y, width, height, z) => ({ x, y, z, width, height, tabOrder: z });

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function titleVco(text) {
  return { title: [{ properties: { show: bool(true), text: str(text), fontSize: num(13), fontColor: solid(C.text) } }] };
}

function visual(page, name, position, body) {
  writeJson(path.join(DEF, 'pages', page, 'visuals', name, 'visual.json'), {
    $schema: S.visual, name, position, visual: body,
  });
}

function textbox(page, name, position, text) {
  visual(page, name, position, {
    visualType: 'textbox',
    objects: {
      general: [{
        properties: {
          paragraphs: [{
            horizontalTextAlignment: 'left',
            textRuns: [{ value: text, textStyle: { fontFamily: 'Segoe UI', fontSize: '24pt', fontWeight: 'bold', color: C.text } }],
          }],
        },
      }],
    },
  });
}

function slicer(page, name, position, projection, mode, title) {
  visual(page, name, position, {
    visualType: 'slicer',
    query: { queryState: { Values: { projections: [projection] } } },
    objects: {
      data: [{ properties: { mode: str(mode) } }],
      header: [{ properties: { show: bool(true), fontColor: solid(C.text) } }],
    },
    visualContainerObjects: titleVco(title),
  });
}

function card(page, name, position, projection, title) {
  visual(page, name, position, {
    visualType: 'cardVisual',
    query: { queryState: { Data: { projections: [projection] } } },
    visualContainerObjects: titleVco(title),
  });
}

function chart(page, name, position, type, category, values, title) {
  visual(page, name, position, {
    visualType: type,
    query: { queryState: { Category: { projections: [category] }, Y: { projections: values } } },
    visualContainerObjects: titleVco(title),
  });
}

function table(page, name, position, values, title) {
  visual(page, name, position, {
    visualType: 'tableEx',
    query: { queryState: { Values: { projections: values } } },
    visualContainerObjects: titleVco(title),
  });
}

function page(name, displayName) {
  writeJson(path.join(DEF, 'pages', name, 'page.json'), {
    $schema: S.page,
    name,
    displayName,
    displayOption: 'FitToPage',
    width: 1920,
    height: 1080,
    objects: { background: [{ properties: { color: solid(C.canvas), transparency: num(0) } }] },
  });
}

// --- Shared layout bands (1920x1080 canvas, per the locked design contract) ---
const TITLE = pos(32, 24, 1056, 88, 0);
const SLICER_A = pos(1120, 32, 372, 80, 1);
const SLICER_B = pos(1516, 32, 372, 80, 2);
const DATE = column('Calendar', 'Date');

fs.rmSync(ROOT, { recursive: true, force: true });

// --- Item + definition metadata ---
writeJson(path.join(ROOT, '.platform'), {
  $schema: S.platform,
  metadata: { type: 'Report', displayName: 'Observability Analytics Report' },
  config: { version: '2.0', logicalId: LOGICAL_ID },
});

writeJson(path.join(ROOT, 'definition.pbir'), {
  $schema: S.defProps,
  version: '4.0',
  datasetReference: {
    byConnection: {
      connectionString: null,
      pbiServiceModelId: null,
      pbiModelVirtualServerName: 'sobe_wowvirtualserver',
      pbiModelDatabaseName: MODEL_ID,
      name: 'EntityDataSource',
      connectionType: 'pbiServiceXmlaStyleLive',
    },
  },
});

writeJson(path.join(DEF, 'version.json'), { $schema: S.version, version: '2.0.0' });

writeJson(path.join(DEF, 'report.json'), {
  $schema: S.report,
  themeCollection: {
    customTheme: { name: `${THEME}.json`, type: 'RegisteredResources', reportVersionAtImport: '5.55' },
  },
  resourcePackages: [{
    name: 'RegisteredResources',
    type: 'RegisteredResources',
    items: [{ name: `${THEME}.json`, path: `${THEME}.json`, type: 'CustomTheme' }],
  }],
});

writeJson(path.join(ROOT, 'StaticResources', 'RegisteredResources', `${THEME}.json`), {
  $schema: S.theme,
  name: `${THEME}.json`,
  dataColors: [C.reliability, C.latency, C.availability, C.cost, C.performance, C.alert],
  background: C.canvas,
  foreground: C.text,
  tableAccent: C.reliability,
  bad: C.alert,
  good: C.availability,
});

writeJson(path.join(DEF, 'pages', 'pages.json'), {
  $schema: S.pages,
  pageOrder: ['reliability', 'cost', 'performance'],
  activePageName: 'reliability',
});

// --- Page 1: Reliability ---
page('reliability', 'Reliability');
textbox('reliability', 'relTitle', TITLE, 'Reliability');
slicer('reliability', 'relSlicerDate', SLICER_A, DATE, 'Between', 'Date range');
slicer('reliability', 'relSlicerService', SLICER_B, column('OperationalMetrics', 'service_name'), 'Dropdown', 'Service');
card('reliability', 'relCardErrorRate', pos(32, 136, 600, 176, 3), measure('OperationalMetrics', 'ErrorRate'), 'Error rate');
card('reliability', 'relCardP95Latency', pos(660, 136, 600, 176, 4), measure('OperationalMetrics', 'P95Latency'), 'P95 latency');
card('reliability', 'relCardAvailability', pos(1288, 136, 600, 176, 5), measure('OperationalMetrics', 'Availability'), 'Availability');
chart('reliability', 'relTrend', pos(32, 336, 1160, 696, 6), 'lineChart', DATE,
  [measure('OperationalMetrics', 'ErrorRate'), measure('OperationalMetrics', 'P95Latency')],
  'Error rate and P95 latency over time');
chart('reliability', 'relByService', pos(1216, 336, 672, 696, 7), 'clusteredColumnChart',
  column('OperationalMetrics', 'service_name'), [measure('OperationalMetrics', 'ErrorRate')],
  'Error rate by service');

// --- Page 2: Cost ---
page('cost', 'Cost');
textbox('cost', 'costTitle', TITLE, 'Cost');
slicer('cost', 'costSlicerDate', SLICER_A, DATE, 'Between', 'Date range');
slicer('cost', 'costSlicerResource', SLICER_B, column('ResourceInventory', 'resource_name'), 'Dropdown', 'Resource');
card('cost', 'costCardTotalCost', pos(32, 136, 440, 176, 3), measure('CostSummary', 'TotalCost'), 'Total cost');
card('cost', 'costCardCostYTD', pos(504, 136, 440, 176, 4), measure('CostSummary', 'CostYTD'), 'Cost YTD');
card('cost', 'costCardAvgMonthlyCost', pos(976, 136, 440, 176, 5), measure('CostSummary', 'AvgMonthlyCost'), 'Average monthly cost');
card('cost', 'costCardCostMoMChange', pos(1448, 136, 440, 176, 6), measure('CostSummary', 'CostMoMChange'), 'Cost MoM change');
chart('cost', 'costTrend', pos(32, 336, 900, 328, 7), 'lineChart', DATE,
  [measure('CostSummary', 'TotalCost')], 'Total cost over time');
chart('cost', 'costByResource', pos(956, 336, 932, 328, 8), 'clusteredBarChart',
  column('ResourceInventory', 'resource_name'), [measure('CostSummary', 'TotalCost')], 'Total cost by resource');
table('cost', 'costDetail', pos(32, 688, 1856, 344, 9), [
  column('ResourceInventory', 'resource_name'),
  column('ResourceInventory', 'resource_type'),
  column('ResourceInventory', 'resource_group'),
  measure('CostSummary', 'TotalCost'),
], 'Resource cost detail');

// --- Page 3: Performance ---
page('performance', 'Performance');
textbox('performance', 'perfTitle', TITLE, 'Performance');
slicer('performance', 'perfSlicerDate', SLICER_A, DATE, 'Between', 'Date range');
slicer('performance', 'perfSlicerModel', SLICER_B, column('AgentAnalytics', 'model_name'), 'Dropdown', 'Model');
card('performance', 'perfCardConversations', pos(32, 136, 600, 176, 3), measure('AgentAnalytics', 'TotalConversations'), 'Total conversations');
card('performance', 'perfCardResponseTime', pos(660, 136, 600, 176, 4), measure('AgentAnalytics', 'AvgResponseTime'), 'Average response time');
card('performance', 'perfCardTokens', pos(1288, 136, 600, 176, 5), measure('AgentAnalytics', 'TotalTokens'), 'Total tokens');
chart('performance', 'perfTrend', pos(32, 336, 900, 328, 6), 'lineChart', DATE, [
  measure('AgentAnalytics', 'TotalConversations'),
  measure('AgentAnalytics', 'AvgResponseTime'),
  measure('AgentAnalytics', 'TotalTokens'),
], 'Agent workload trend');
chart('performance', 'perfByModel', pos(956, 336, 932, 328, 7), 'clusteredBarChart',
  column('AgentAnalytics', 'model_name'), [measure('AgentAnalytics', 'TotalConversations')],
  'Conversations by model');
table('performance', 'perfDetail', pos(32, 688, 1856, 344, 8), [
  column('AgentAnalytics', 'model_name'),
  column('AgentAnalytics', 'topic_classification'),
  measure('AgentAnalytics', 'TotalConversations'),
  measure('AgentAnalytics', 'AvgResponseTime'),
  measure('AgentAnalytics', 'TotalTokens'),
], 'Model and topic detail');

console.log(`PBIR written to ${ROOT}`);

// --- Fabric create-item request body (InlineBase64 parts) ---
function collect(dir, parts = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) collect(full, parts);
    else parts.push({
      path: path.relative(ROOT, full).split(path.sep).join('/'),
      payload: fs.readFileSync(full).toString('base64'),
      payloadType: 'InlineBase64',
    });
  }
  return parts;
}

const requestPath = path.join(__dirname, '..', 'powerbi', 'create-report-request.json');
const parts = collect(ROOT);
writeJson(requestPath, {
  displayName: 'Observability Analytics Report',
  description: 'Reliability, cost, and agent performance control tower for the Observability Analytics model.',
  type: 'Report',
  definition: { parts },
});
console.log(`Fabric request body written to ${requestPath} (${parts.length} parts)`);
