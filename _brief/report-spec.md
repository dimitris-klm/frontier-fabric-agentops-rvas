# Observability Analytics Report Specification

Status: Locked and approved for implementation

Approval basis: On 2026-09-04, the user explicitly requested that the previously provided three-page report instructions be implemented directly in Fabric.

## Target

- Workspace: `Observability-Analytics`
- Workspace ID: `7d793729-4bed-4efb-b43a-20e6a5edc674`
- Semantic model: `Observability Analytics`
- Semantic model ID: `feea7d92-f707-47aa-8e9d-fc8bfe89f5ed`
- Report name: `Observability Analytics Report`
- Delivery: Create directly in Microsoft Fabric

## Audience And Purpose

- Audience: Platform operators and engineering leadership
- Purpose: Monitor reliability, cost, and agent workload performance from one operational report
- Success criteria: Three complete data-bound pages; expected cross-filtering; sensible measure values; all five source tables remain Direct Lake

## Verified Model Inventory

- `Calendar`: date attributes; Direct Lake
- `ResourceInventory`: resource dimensions; Direct Lake
- `OperationalMetrics`: reliability facts and `ErrorRate`, `P95Latency`, `Availability`; Direct Lake
- `CostSummary`: cost facts and `TotalCost`, `CostYTD`, `AvgMonthlyCost`, `CostMoMChange`; Direct Lake
- `AgentAnalytics`: workload facts and `TotalConversations`, `AvgResponseTime`, `TotalTokens`; Direct Lake
- Four active many-to-one relationships connect the facts to `Calendar` and cost to `ResourceInventory`

## Page Plan

### 1. Reliability

- Slicers: `Calendar[Date]` as Between; `OperationalMetrics[service_name]`
- KPI cards: `ErrorRate`, `P95Latency`, `Availability`
- Line chart: `Calendar[Date]` by `ErrorRate` and `P95Latency`
- Clustered column chart: `OperationalMetrics[service_name]` by `ErrorRate`

### 2. Cost

- Slicers: `Calendar[Date]` as Between; `ResourceInventory[resource_name]`
- KPI cards: `TotalCost`, `CostYTD`, `AvgMonthlyCost`, `CostMoMChange`
- Line chart: `Calendar[Date]` by `TotalCost`
- Bar chart: `ResourceInventory[resource_name]` by `TotalCost`
- Table: `ResourceInventory[resource_name]`, `ResourceInventory[resource_type]`, `ResourceInventory[resource_group]`, `TotalCost`

### 3. Performance

- Slicers: `Calendar[Date]` as Between; `AgentAnalytics[model_name]`
- KPI cards: `TotalConversations`, `AvgResponseTime`, `TotalTokens`
- Line chart: `Calendar[Date]` by `TotalConversations`, `AvgResponseTime`, and `TotalTokens`
- Bar chart: `AgentAnalytics[model_name]` by `TotalConversations`
- Table: `AgentAnalytics[model_name]`, `AgentAnalytics[topic_classification]`, `TotalConversations`, `AvgResponseTime`, `TotalTokens`

## Canonical Design Contract

```yaml
Design Brief:
  generated_by: powerbi-report-design
  contract_version: 1
  mode: greenfield
  design_identity:
    tone: operational control tower
    signature: compact status header with a consistent KPI rail
  canvas: { width: 1920, height: 1080, margin: 32, gutter: 24, snap: 8 }
  palette:
    canvas: "#F4F7F9"
    surface: "#FFFFFF"
    text: "#17212B"
    muted: "#5B6875"
    reliability: "#007C91"
    latency: "#D97706"
    availability: "#2E7D32"
    cost: "#1D4ED8"
    performance: "#7C3AED"
    alert: "#C62828"
  typography:
    family: Segoe UI
    page_title_pt: 24
    visual_title_pt: 13
    body_pt: 11
  accessibility:
    minimum_contrast: WCAG AA
    color_is_not_the_only_status_signal: true
    descriptive_titles_and_alt_text: true
    logical_tab_order: true
  pages:
    - name: Reliability
      role: landing
      archetype: Operational Monitor
      layout_variant: KPI rail plus trend and service comparison
      variant_rationale: Reliability requires immediate status scanning followed by temporal and service-level diagnosis.
      layout_contract:
        header: [32, 24, 1856, 88]
        slicers: [1120, 32, 768, 64]
        kpi_rail: [32, 136, 1856, 176]
        trend: [32, 336, 1160, 696]
        comparison: [1216, 336, 672, 696]
        space_audit: { empty_cell_pct: 0, unplaced_regions: [] }
    - name: Cost
      role: detail
      archetype: Analytical Canvas
      layout_variant: KPI rail plus trend, ranking, and detail table
      variant_rationale: Cost analysis needs headline totals, time movement, resource comparison, and inspectable inventory detail.
      layout_contract:
        header: [32, 24, 1856, 88]
        slicers: [1120, 32, 768, 64]
        kpi_rail: [32, 136, 1856, 176]
        trend: [32, 336, 900, 328]
        ranking: [956, 336, 932, 328]
        detail: [32, 688, 1856, 344]
        space_audit: { empty_cell_pct: 0, unplaced_regions: [] }
    - name: Performance
      role: detail
      archetype: Analytical Canvas
      layout_variant: KPI rail plus trend, model ranking, and topic detail
      variant_rationale: Agent performance needs temporal diagnosis, model comparison, and topic-level detail in one analytical flow.
      layout_contract:
        header: [32, 24, 1856, 88]
        slicers: [1120, 32, 768, 64]
        kpi_rail: [32, 136, 1856, 176]
        trend: [32, 336, 900, 328]
        ranking: [956, 336, 932, 328]
        detail: [32, 688, 1856, 344]
        space_audit: { empty_cell_pct: 0, unplaced_regions: [] }
```

## Validation

- Validate the PBIR definition after each authoring batch
- Confirm all three pages render with data
- Confirm page slicers filter the expected visuals
- Confirm every requested measure returns plausible values
- Confirm all five model table partitions remain `DirectLake`
- Publish only after validation passes