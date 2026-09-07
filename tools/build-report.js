// Generates the PBIR definition for the Observability Analytics report from _brief/report-spec.md.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'powerbi', 'Observability Analytics Report.Report');
const DEF = path.join(ROOT, 'definition');

// Placeholder by design: deploy_report.py resolves the real id from the semantic model name.
const MODEL_ID = process.env.PBI_MODEL_ID || '00000000-0000-0000-0000-000000000000';
const LOGICAL_ID = '7f3c1d92-4b8e-46a1-9c05-2e6b8d51a7f4';
const THEME = 'ObservabilityControlTower';

// Power BI substitutes unknown families silently; Segoe UI is the guaranteed stand-in for Aptos.
const FONT = 'Segoe UI';
const FONT_BOLD = 'Segoe UI Semibold';

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

// RVAP brand kit
const C = {
  primary: '#1A77E3',
  navy: '#032254',
  charcoal: '#47494E',
  teal: '#14868A',
  purple: '#504092',
  msblue: '#0078D4',
  white: '#FFFFFF',
  neutral: '#E3E6ED',
  surface: '#F5F8FE',
  muted: '#6B7280',
  amber: '#D97706',
  red: '#C62828',
  green: '#2E7D32',
  onNavyStrong: '#8FB8EA',
  onNavySoft: '#C7D8F2',
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

function titleVco(text, color = C.navy) {
  return {
    title: [{ properties: { show: bool(true), text: str(text), fontSize: num(12), fontFamily: str(FONT_BOLD), fontColor: solid(color), alignment: str('left') } }],
    background: [{ properties: { show: bool(true), color: solid(C.white), transparency: num(0) } }],
    border: [{ properties: { show: bool(true), color: solid(C.neutral), radius: num(8) } }],
  };
}

function visual(page, name, position, body) {
  writeJson(path.join(DEF, 'pages', page, 'visuals', name, 'visual.json'), {
    $schema: S.visual, name, position, visual: body,
  });
}

function textbox(page, name, position, paragraphs, background) {
  const body = {
    visualType: 'textbox',
    objects: { general: [{ properties: { paragraphs } }] },
  };
  if (background) {
    body.visualContainerObjects = {
      background: [{ properties: { show: bool(true), color: solid(background), transparency: num(0) } }],
    };
  }
  visual(page, name, position, body);
}

const run = (value, size, color, weight = 'normal', font = FONT) => ({
  value,
  textStyle: { fontFamily: font, fontSize: `${size}pt`, fontWeight: weight, color },
});

// Navy masthead carrying the programme name, the page name and a one-line framing statement.
function header(page, name, title, subtitle) {
  textbox(page, name, pos(0, 0, 1920, 104, 0), [
    { horizontalTextAlignment: 'left', textRuns: [run('OBSERVABILITY CONTROL TOWER', 10, C.onNavyStrong, 'bold', FONT_BOLD)] },
    { horizontalTextAlignment: 'left', textRuns: [run(title, 24, C.white, 'bold', FONT_BOLD)] },
    { horizontalTextAlignment: 'left', textRuns: [run(subtitle, 11, C.onNavySoft)] },
  ], C.navy);
}

function sectionLabel(page, name, position, text) {
  textbox(page, name, position, [
    { horizontalTextAlignment: 'left', textRuns: [run(text, 12, C.muted, 'bold', FONT_BOLD)] },
  ]);
}

function slicer(page, name, position, projection, mode, title) {
  visual(page, name, position, {
    visualType: 'slicer',
    query: { queryState: { Values: { projections: [projection] } } },
    objects: { data: [{ properties: { mode: str(mode) } }] },
    visualContainerObjects: titleVco(title),
  });
}

function card(page, name, position, projection, title, accent) {
  visual(page, name, position, {
    visualType: 'cardVisual',
    query: { queryState: { Data: { projections: [projection] } } },
    visualContainerObjects: titleVco(title, accent),
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
    objects: { background: [{ properties: { color: solid(C.surface), transparency: num(0) } }] },
  });
}

// --- Shared layout bands (1920x1080 canvas, 32px margin, 24px gutter) ---
// Rows: header 0-104 | slicers 128-224 | KPI 248-400 | charts 424-716 | charts 740-1048
const SLICER_A = pos(1160, 128, 352, 96, 1);
const SLICER_B = pos(1536, 128, 352, 96, 2);
const LABEL = pos(32, 128, 1100, 96, 3);
const kpi = (x, width, z) => pos(x, 248, width, 152, z);
const rowA = (x, width, z) => pos(x, 424, width, 292, z);
const rowB = (x, width, z) => pos(x, 740, width, 308, z);
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

const textClass = (size, color, font = FONT) => ({ fontFace: font, fontSize: size, color });
const panel = [
  { show: true, color: { solid: { color: C.white } }, transparency: 0 },
];
const panelBorder = [
  { show: true, color: { solid: { color: C.neutral } }, radius: 8 },
];
const chartStyle = {
  '*': {
    background: panel,
    border: panelBorder,
    visualHeader: [{ show: false }],
    labels: [{ color: { solid: { color: C.charcoal } }, fontSize: 9, fontFamily: FONT }],
    categoryAxis: [{ show: true, labelColor: { solid: { color: C.muted } }, fontSize: 9, gridlineShow: false }],
    valueAxis: [{ show: true, labelColor: { solid: { color: C.muted } }, fontSize: 9, gridlineColor: { solid: { color: C.neutral } } }],
    legend: [{ show: true, position: 'Top', labelColor: { solid: { color: C.charcoal } }, fontSize: 9 }],
  },
};

writeJson(path.join(ROOT, 'StaticResources', 'RegisteredResources', `${THEME}.json`), {
  $schema: S.theme,
  name: `${THEME}.json`,
  dataColors: [C.primary, C.teal, C.purple, C.msblue, C.navy, C.amber, C.red, C.green],
  background: C.surface,
  backgroundLight: C.neutral,
  backgroundNeutral: C.neutral,
  foreground: C.navy,
  foregroundNeutralSecondary: C.charcoal,
  foregroundNeutralTertiary: C.muted,
  tableAccent: C.primary,
  good: C.teal,
  neutral: C.amber,
  bad: C.red,
  maximum: C.primary,
  center: C.neutral,
  minimum: C.msblue,
  textClasses: {
    callout: textClass(36, C.navy, FONT_BOLD),
    title: textClass(13, C.navy, FONT_BOLD),
    header: textClass(11, C.charcoal, FONT_BOLD),
    label: textClass(9, C.charcoal),
  },
  visualStyles: {
    lineChart: chartStyle,
    clusteredColumnChart: chartStyle,
    clusteredBarChart: chartStyle,
    cardVisual: {
      // cardVisual rejects border.radius at theme level; the corner radius is set per visual instead.
      '*': {
        background: panel,
        border: [{ show: true, color: { solid: { color: C.neutral } } }],
        visualHeader: [{ show: false }],
        outline: [{ show: false }],
        // The container title already names the measure; the card's own label would repeat it.
        label: [{ show: false }],
      },
    },
    tableEx: {
      '*': {
        background: panel,
        border: panelBorder,
        visualHeader: [{ show: false }],
        grid: [{ gridVertical: false, gridHorizontalColor: { solid: { color: C.neutral } }, outlineColor: { solid: { color: C.neutral } } }],
        columnHeaders: [{ fontColor: { solid: { color: C.navy } }, backColor: { solid: { color: C.surface } }, fontFamily: FONT_BOLD, fontSize: 9 }],
        values: [{ fontColor: { solid: { color: C.charcoal } }, fontSize: 9, backColorPrimary: { solid: { color: C.white } }, backColorSecondary: { solid: { color: C.surface } } }],
      },
    },
    slicer: {
      '*': {
        background: panel,
        border: panelBorder,
        visualHeader: [{ show: false }],
        // The container title already names the slicer; its own header would repeat the field name.
        header: [{ show: false }],
        items: [{ fontColor: { solid: { color: C.charcoal } }, textSize: 9 }],
      },
    },
  },
});

writeJson(path.join(DEF, 'pages', 'pages.json'), {
  $schema: S.pages,
  pageOrder: ['executive', 'reliability', 'cost', 'performance'],
  activePageName: 'executive',
});

// --- Page 1: Executive Overview ---
page('executive', 'Executive Overview');
header('executive', 'execHeader', 'Executive Overview', 'Spend, reliability and agent workload for the estate at a glance.');
sectionLabel('executive', 'execLabel', LABEL, 'ESTATE HEALTH');
slicer('executive', 'execSlicerDate', SLICER_A, DATE, 'Between', 'Date range');
slicer('executive', 'execSlicerService', SLICER_B, column('OperationalMetrics', 'service_name'), 'Dropdown', 'Service');
card('executive', 'execCardTotalCost', kpi(32, 352, 4), measure('CostSummary', 'TotalCost'), 'Total cost', C.primary);
card('executive', 'execCardCostMoM', kpi(408, 352, 5), measure('CostSummary', 'CostMoMChange'), 'Cost MoM change', C.msblue);
card('executive', 'execCardAvailability', kpi(784, 352, 6), measure('OperationalMetrics', 'Availability'), 'Availability', C.teal);
card('executive', 'execCardErrorRate', kpi(1160, 352, 7), measure('OperationalMetrics', 'ErrorRate'), 'Error rate', C.red);
card('executive', 'execCardConversations', kpi(1536, 352, 8), measure('AgentAnalytics', 'TotalConversations'), 'Conversations', C.purple);
chart('executive', 'execCostTrend', rowA(32, 916, 9), 'lineChart', DATE,
  [measure('CostSummary', 'TotalCost')], 'Spend over time');
chart('executive', 'execReliabilityTrend', rowA(972, 916, 10), 'lineChart', DATE,
  [measure('OperationalMetrics', 'ErrorRate'), measure('OperationalMetrics', 'P95Latency')],
  'Error rate and P95 latency over time');
chart('executive', 'execCostByService', rowB(32, 602, 11), 'clusteredBarChart',
  column('CostSummary', 'service_name'), [measure('CostSummary', 'TotalCost')], 'Spend by service');
chart('executive', 'execAvailabilityByService', rowB(658, 602, 12), 'clusteredColumnChart',
  column('OperationalMetrics', 'service_name'), [measure('OperationalMetrics', 'Availability')], 'Availability by service');
chart('executive', 'execConversationsByModel', rowB(1284, 602, 13), 'clusteredBarChart',
  column('AgentAnalytics', 'model_name'), [measure('AgentAnalytics', 'TotalConversations')], 'Conversations by model');

// --- Page 2: Reliability ---
page('reliability', 'Reliability');
header('reliability', 'relHeader', 'Reliability', 'Error rate, latency and availability by service across the selected window.');
sectionLabel('reliability', 'relLabel', LABEL, 'SERVICE HEALTH');
slicer('reliability', 'relSlicerDate', SLICER_A, DATE, 'Between', 'Date range');
slicer('reliability', 'relSlicerService', SLICER_B, column('OperationalMetrics', 'service_name'), 'Dropdown', 'Service');
card('reliability', 'relCardErrorRate', kpi(32, 602, 4), measure('OperationalMetrics', 'ErrorRate'), 'Error rate', C.red);
card('reliability', 'relCardP95Latency', kpi(658, 602, 5), measure('OperationalMetrics', 'P95Latency'), 'P95 latency', C.amber);
card('reliability', 'relCardAvailability', kpi(1284, 602, 6), measure('OperationalMetrics', 'Availability'), 'Availability', C.teal);
chart('reliability', 'relTrend', rowA(32, 1160, 7), 'lineChart', DATE,
  [measure('OperationalMetrics', 'ErrorRate'), measure('OperationalMetrics', 'P95Latency')],
  'Error rate and P95 latency over time');
chart('reliability', 'relByService', rowA(1216, 672, 8), 'clusteredColumnChart',
  column('OperationalMetrics', 'service_name'), [measure('OperationalMetrics', 'ErrorRate')],
  'Error rate by service');
table('reliability', 'relDetail', rowB(32, 1856, 9), [
  column('OperationalMetrics', 'service_name'),
  measure('OperationalMetrics', 'ErrorRate'),
  measure('OperationalMetrics', 'P95Latency'),
  measure('OperationalMetrics', 'Availability'),
], 'Service reliability detail');

// --- Page 3: Cost ---
page('cost', 'Cost');
header('cost', 'costHeader', 'Cost', 'Where spend lands, how it trends and which resources drive it.');
sectionLabel('cost', 'costLabel', LABEL, 'SPEND POSITION');
slicer('cost', 'costSlicerDate', SLICER_A, DATE, 'Between', 'Date range');
slicer('cost', 'costSlicerResource', SLICER_B, column('ResourceInventory', 'resource_name'), 'Dropdown', 'Resource');
card('cost', 'costCardTotalCost', kpi(32, 446, 4), measure('CostSummary', 'TotalCost'), 'Total cost', C.primary);
card('cost', 'costCardCostYTD', kpi(502, 446, 5), measure('CostSummary', 'CostYTD'), 'Cost YTD', C.msblue);
card('cost', 'costCardAvgMonthlyCost', kpi(972, 446, 6), measure('CostSummary', 'AvgMonthlyCost'), 'Average monthly cost', C.teal);
card('cost', 'costCardCostMoMChange', kpi(1442, 446, 7), measure('CostSummary', 'CostMoMChange'), 'Cost MoM change', C.amber);
chart('cost', 'costTrend', rowA(32, 916, 8), 'lineChart', DATE,
  [measure('CostSummary', 'TotalCost')], 'Total cost over time');
chart('cost', 'costByResource', rowA(972, 916, 9), 'clusteredBarChart',
  column('ResourceInventory', 'resource_name'), [measure('CostSummary', 'TotalCost')], 'Total cost by resource');
table('cost', 'costDetail', rowB(32, 1856, 10), [
  column('ResourceInventory', 'resource_name'),
  column('ResourceInventory', 'resource_type'),
  column('ResourceInventory', 'resource_group'),
  measure('CostSummary', 'TotalCost'),
], 'Resource cost detail');

// --- Page 4: Performance ---
page('performance', 'Performance');
header('performance', 'perfHeader', 'Performance', 'Agent conversations, response time and token consumption by model and topic.');
sectionLabel('performance', 'perfLabel', LABEL, 'AGENT WORKLOAD');
slicer('performance', 'perfSlicerDate', SLICER_A, DATE, 'Between', 'Date range');
slicer('performance', 'perfSlicerModel', SLICER_B, column('AgentAnalytics', 'model_name'), 'Dropdown', 'Model');
card('performance', 'perfCardConversations', kpi(32, 602, 4), measure('AgentAnalytics', 'TotalConversations'), 'Total conversations', C.purple);
card('performance', 'perfCardResponseTime', kpi(658, 602, 5), measure('AgentAnalytics', 'AvgResponseTime'), 'Average response time', C.amber);
card('performance', 'perfCardTokens', kpi(1284, 602, 6), measure('AgentAnalytics', 'TotalTokens'), 'Total tokens', C.primary);
chart('performance', 'perfTrend', rowA(32, 916, 7), 'lineChart', DATE, [
  measure('AgentAnalytics', 'TotalConversations'),
  measure('AgentAnalytics', 'AvgResponseTime'),
  measure('AgentAnalytics', 'TotalTokens'),
], 'Agent workload trend');
chart('performance', 'perfByModel', rowA(972, 916, 8), 'clusteredBarChart',
  column('AgentAnalytics', 'model_name'), [measure('AgentAnalytics', 'TotalConversations')],
  'Conversations by model');
table('performance', 'perfDetail', rowB(32, 1856, 9), [
  column('AgentAnalytics', 'model_name'),
  column('AgentAnalytics', 'topic_classification'),
  measure('AgentAnalytics', 'TotalConversations'),
  measure('AgentAnalytics', 'AvgResponseTime'),
  measure('AgentAnalytics', 'TotalTokens'),
], 'Model and topic detail');

console.log(`PBIR written to ${ROOT}`);

// --- Fabric request bodies (InlineBase64 parts) ---
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

const parts = collect(ROOT);

writeJson(path.join(__dirname, '..', 'powerbi', 'create-report-request.json'), {
  displayName: 'Observability Analytics Report',
  description: 'Reliability, cost, and agent performance control tower for the Observability Analytics model.',
  type: 'Report',
  definition: { parts },
});

writeJson(path.join(__dirname, '..', 'powerbi', 'update-report-request.json'), {
  definition: { parts },
});

console.log(`Fabric request bodies written (${parts.length} parts)`);
