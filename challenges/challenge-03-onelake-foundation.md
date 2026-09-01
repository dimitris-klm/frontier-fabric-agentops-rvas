# Challenge 3 — Connect Fabric to the Enterprise

> **Est. time:** 2 h · **Level:** 300 · **Roles:** Data engineer, Fabric engineer, platform engineer

---

> **Mission log.**
> The Control Tower has signals now — agent conversations in Cosmos DB, telemetry and cost files in
> ADLS Gen2 — but the customer's enterprise data is still sitting outside the tower walls. Your job is
> to connect it to Microsoft Fabric without copying piles of data around. This is where OneLake becomes
> the customer's unifying data estate.

In this challenge you build the **Fabric foundation** for the rest of the RVAS: a Lakehouse that
sees the Challenge 2 landing-zone files through **OneLake shortcuts**, and a mirrored Cosmos DB source
that brings Challenge 1 agent conversations into OneLake Delta tables for near-real-time analytics.

The important distinction: shortcuts are **zero-copy pointers** to existing files; Mirroring is
**managed replication** into Fabric. You need both.

## Objectives

By the end of this challenge you will have:

- A team **Fabric workspace** assigned to your Fabric capacity.
- An **Observability** Lakehouse in that workspace.
- Four working **OneLake shortcuts** to the ADLS Gen2 landing-zone containers from Challenge 2:
  `costs`, `metrics`, `logs`, and `metadata`.
- Cosmos DB **Mirroring** configured for the agent conversation data from Challenge 1.
- Proof that Fabric can query both a shortcut-backed file and a mirrored Cosmos table.
- A crisp explanation of **zero-copy shortcuts** vs **Mirroring replication**.

## Prerequisites

- ✅ Challenge 1 complete — the agent workload has written conversation data to Cosmos DB.
- ✅ Challenge 2 complete — the ADLS Gen2 landing zone contains files in `costs`, `metrics`, `logs`,
  and `metadata`.
- Fabric capacity ID from Challenge 0.
- ADLS Gen2 **DFS endpoint** from Challenge 2, like `https://<account>.dfs.core.windows.net`.
- Fabric cloud connection ID for that ADLS Gen2 endpoint, created in Step 1.
- Cosmos DB account name and database name from Challenge 1.
- Fabric tenant settings allow service principal / managed identity access and **Mirroring**.
- The reference setup assets in
  [`resources/fabric-control-tower/`](../resources/fabric-control-tower/).

## The foundation

Your architecture now gets its Fabric entry point:

```text
Challenge 2 ADLS Gen2 landing zone       Challenge 1 Cosmos DB
costs · metrics · logs · metadata        conversations · messages/feedback
          │                                         │
          │ OneLake shortcuts (zero copy)           │ Fabric Mirroring
          ▼                                         ▼
  Fabric Lakehouse Files/                    Mirrored Delta tables
          └───────────────► Challenge 4 Bronze layer ◄───────────────┘
```

Shortcuts keep the source files where they are. Mirroring continuously lands operational records into
OneLake-managed Delta tables. Challenge 4 will use both as Bronze inputs.

## Your mission

### 1. Create the ADLS Gen2 cloud connection

- Grant your organizational account **Storage Blob Data Reader** on the ADLS Gen2 storage account from
  Challenge 2.
- Confirm the storage account DFS endpoint and the four expected containers are available:
  `costs`, `metrics`, `logs`, and `metadata`.
- In Fabric, open **Settings** > **Manage connections and gateways**, select **New**, and create a
  **Cloud** connection of type **Azure Data Lake Storage Gen2**.
- Use the storage account DFS endpoint as the server, select **Organizational account** authentication,
  and set the privacy level to **Organizational**. If prompted for a path, use the storage account root
  so the connection can reach all four containers.
- Open the new connection's settings and copy its **Connection ID**. You will pass this GUID to the
  setup script.

This is a one-time setup. One cloud connection can authenticate all four shortcuts because they use the
same storage account.

### 2. Create the Lakehouse and OneLake shortcuts

- Create or reuse your team Fabric workspace on the Fabric capacity.
- Create a Lakehouse for the Control Tower foundation.
- Add OneLake shortcuts under the Lakehouse `Files/` area that point to the four ADLS Gen2 containers.
- Browse each shortcut and confirm you are seeing the **same files** that landed in Challenge 2 — not
  a copied export.

The provided setup script can automate the workspace, Lakehouse, shortcuts, notebook imports, and
pipeline imports:

```bash
cd resources/fabric-control-tower
pip install -r src/setup/requirements.txt

python src/setup/setup_fabric_workspace.py \
  --workspace-name "Observability-Analytics" \
  --storage-account-url "https://<account>.dfs.core.windows.net" \
  --connection-id "<fabric-cloud-connection-id>" \
  --capacity-id "<fabric-capacity-id>"
```

### 3. Mirror the agent conversation database

- Enable the Cosmos DB prerequisites for Fabric Mirroring, including continuous backup / analytical
  store as required by your Cosmos DB configuration.
- Create a Fabric mirrored database item for the Cosmos DB database used by the agent workload.
- Select the conversation containers from Challenge 1. The reference assets describe
  `conversations`, `messages`, and `feedback`; the included setup script currently configures
  `conversations` and `interactions`, so verify the actual container names created by your workload.
- Start Mirroring and wait for the status to become healthy/running.

Reference command:

```bash
cd resources/fabric-control-tower
python src/setup/setup_cosmos_mirroring.py \
  --workspace-id "<fabric-workspace-id>" \
  --cosmos-account "<cosmos-account-name>" \
  --database "observability"
```

### 4. Prove both paths work

Show your team and coach that Fabric can read from both enterprise connection patterns:

- **Shortcut path:** browse `Files/costs`, `Files/metrics`, `Files/logs`, and `Files/metadata` in the
  Lakehouse and open or query one file.
- **Mirroring path:** open the mirrored database, confirm the expected tables are present, and verify
  the sync status shows recent activity.
- **Latency target:** after adding one new agent conversation, look for it in the mirrored table within
  roughly a minute.
- **Query proof:** run one simple query against a shortcut-backed file and one simple query against a
  mirrored table.

## Success criteria

- [ ] Fabric workspace is assigned to the correct capacity and the team can open it.
- [ ] Lakehouse exists for the Control Tower foundation.
- [ ] Four shortcuts exist and browse successfully: `costs`, `metrics`, `logs`, `metadata`.
- [ ] Browsed shortcut files match the ADLS Gen2 files from Challenge 2 — no duplicate copy was made.
- [ ] Cosmos DB mirrored database exists with the expected conversation tables.
- [ ] Mirroring is running/healthy and recent records are syncing.
- [ ] Your team can query one shortcut file and one mirrored table.
- [ ] Your team can explain **zero-copy shortcut** vs **Mirroring replication** to your coach.

> 🧭 **Checkpoint:** show your coach the Lakehouse shortcuts, the mirrored Cosmos tables, and one query
> from each path. Then explain which path copies data and which path does not.

## Hints

<details>
<summary>What does "zero copy" mean here?</summary>

A OneLake shortcut is a pointer. The files stay in the ADLS Gen2 storage account from Challenge 2, but
Fabric presents them inside the Lakehouse `Files/` tree. You avoid duplicate storage, export jobs, and
extra egress. If the source file changes, Fabric reads the source location.
</details>

<details>
<summary>Granting storage access</summary>

Use the storage account from Challenge 2 and grant the organizational account used by the Fabric cloud
connection a data-plane role such as **Storage Blob Data Reader** at the storage-account scope. RBAC can
take a few minutes to propagate before shortcut browsing works.
</details>

<details>
<summary>What the workspace setup script creates</summary>

[`setup_fabric_workspace.py`](../resources/fabric-control-tower/src/setup/setup_fabric_workspace.py)
uses the Fabric REST API to:

1. Create or reuse the workspace.
2. Create the `Observability` Lakehouse.
3. Create shortcuts for `costs`, `metrics`, `logs`, and `metadata` under `Files/`.
4. Import notebooks from `resources/fabric-control-tower/fabric/notebooks/`.
5. Import pipelines from `resources/fabric-control-tower/fabric/pipelines/`.

The script waits for asynchronous Fabric item creation to finish before it creates dependent resources.
</details>

<details>
<summary>Checking mirrored tables</summary>

Open the mirrored database item in Fabric and look for the selected Cosmos DB containers as tables. If
they are empty, generate a few more agent conversations in the Challenge 1 app, then re-check the
Mirroring status and sync timestamp.
</details>

<details>
<summary>Quick query ideas</summary>

For a shortcut file, use a Fabric notebook to read a Parquet file or folder from `Files/costs` or
`Files/metadata`. For a mirrored table, run a simple `SELECT TOP 10` in the mirrored database SQL
endpoint or inspect it from Spark. Keep it simple — Challenge 4 will do the heavy transformation.
</details>

## Resources

- [`resources/fabric-control-tower/README.md`](../resources/fabric-control-tower/README.md) — Fabric setup, shortcuts, Mirroring, notebooks, and pipelines
- [`resources/fabric-control-tower/src/setup/setup_fabric_workspace.py`](../resources/fabric-control-tower/src/setup/setup_fabric_workspace.py) — workspace, Lakehouse, shortcuts, imports
- [`resources/fabric-control-tower/src/setup/setup_cosmos_mirroring.py`](../resources/fabric-control-tower/src/setup/setup_cosmos_mirroring.py) — Cosmos DB Mirroring setup
- [`docs/architecture.md`](../docs/architecture.md) — OneLake shortcuts and Mirroring in the end-to-end architecture

---

⬅️ Previous: **[Challenge 2 — Build the Telemetry Landing Zone](challenge-02-landing-zone.md)**  
➡️ Next: **[Challenge 4 — Refine the Signal](challenge-04-medallion-pipeline.md)**
