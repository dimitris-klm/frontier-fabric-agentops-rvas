# Coach Guide — Challenge 3: Connect Fabric to the Enterprise

> Attendee challenge: [`challenges/challenge-03-onelake-foundation.md`](../challenges/challenge-03-onelake-foundation.md)

## Snapshot

| | |
|---|---|
| **Est. time** | 2 h |
| **Difficulty** | ⭐⭐⭐ (300) |
| **They build** | Fabric Lakehouse with OneLake shortcuts plus Cosmos DB Mirroring |
| **Key services** | Fabric Lakehouse, OneLake shortcuts, Cosmos DB Mirroring, workspace identity |

## Coaching objectives

This is the **Fabric foundation aha moment**: enterprise data does not need another copy job before it
can become useful. Teams should leave understanding two distinct patterns:

- **OneLake shortcuts** expose ADLS Gen2 files in Fabric with zero duplication.
- **Cosmos DB Mirroring** continuously replicates operational data into OneLake Delta tables without a
  hand-built connector pipeline.

**What good looks like:** the team opens a Lakehouse, browses four shortcuts, opens a mirrored Cosmos
database with recent rows, runs one query against each path, and explains why this feeds Bronze in
Challenge 4.

## The reference path

Run from the repo root unless noted.

1. **Install setup dependencies**
   ```bash
   cd resources/fabric-control-tower
   pip install -r src/setup/requirements.txt
   ```

2. **Create the ADLS Gen2 cloud connection**
   - The organizational account used by the connection needs **Storage Blob Data Reader** on the ADLS
     Gen2 account created in Challenge 2.
   - The setup script uses ADLS Gen2 shortcuts with the storage DFS endpoint, so the URL should look
     like `https://<account>.dfs.core.windows.net`.
   - Containers expected by the script: `costs`, `metrics`, `logs`, `metadata`.
   - In Fabric, open **Settings** > **Manage connections and gateways**, create a **Cloud** connection
     of type **Azure Data Lake Storage Gen2**, and use **Organizational account** authentication with
     the **Organizational** privacy level.
   - Scope the connection to the storage account root if a path is requested, then copy the connection
     ID from its settings. The same connection ID is used for all four shortcuts.

3. **Create workspace, Lakehouse, shortcuts, notebooks, and pipelines**
   ```bash
   python src/setup/setup_fabric_workspace.py \
     --workspace-name "Observability-Analytics" \
     --storage-account-url "https://<account>.dfs.core.windows.net" \
     --connection-id "<fabric-cloud-connection-id>" \
     --capacity-id "<fabric-capacity-id>"
   ```

   The script creates/reuses the Fabric workspace, creates the `Observability` Lakehouse, adds
   shortcuts under `Files/`, imports notebooks from `fabric/notebooks/`, and imports pipeline JSON from
   `fabric/pipelines/`. It prints the workspace and Lakehouse IDs; have the team capture them.

4. **Configure Cosmos DB Mirroring**
   ```bash
   python src/setup/setup_cosmos_mirroring.py \
     --workspace-id "<workspace-id>" \
     --cosmos-account "<cosmos-account-name>" \
     --database "observability"
   ```

   Real flags are `--workspace-id`, `--cosmos-account`, and `--database`. The current script mirrors
   `conversations` and `interactions`; the README narrative references `conversations`, `messages`, and
   `feedback`. Coach teams to verify the actual containers created in Challenge 1 and adjust selection
   in Fabric UI or the script if their deployment differs.

5. **Handle async Fabric API creation**
   - `setup_fabric_workspace.py` and `setup_cosmos_mirroring.py` both tolerate existing items.
  - `setup_fabric_workspace.py` waits for asynchronous item creation before continuing.

## Checkpoint verification

Ask the team to show:

1. **Workspace + Lakehouse** — workspace assigned to the intended capacity; `Observability` Lakehouse
   exists.
2. **Shortcuts** — `Files/costs`, `Files/metrics`, `Files/logs`, `Files/metadata` browse successfully.
3. **Zero-copy proof** — a file visible through a shortcut matches the ADLS Gen2 landing-zone path from
   Challenge 2.
4. **Mirroring** — mirrored database item exists; selected tables are present; status is running or
   healthy.
5. **Freshness** — after a new agent conversation, the row appears in Fabric with target latency under
   roughly one minute.
6. **Queries** — one shortcut-backed file query and one mirrored-table query run successfully.
7. **Explanation** — team can state: shortcuts are pointers; Mirroring replicates to Delta.

✅ Pass when all four shortcuts work, mirrored tables are syncing, and the team can explain both data
movement patterns without prompting.

## Common pitfalls & fixes

| Pitfall | Fix |
|---|---|
| Shortcut creation fails because `connectionId` is missing or invalid | Create the ADLS Gen2 cloud connection, copy its connection ID, and pass it with `--connection-id` |
| Shortcut creation or browsing returns **403** | Grant the organizational account used by the cloud connection **Storage Blob Data Reader** on the Challenge 2 storage account; wait for RBAC propagation |
| Fabric **Mirroring tenant setting** disabled | Fabric admin must enable Mirroring and service principal / managed identity access in tenant settings |
| Cosmos continuous backup / analytical store not enabled → mirrored tables empty | Enable the required Cosmos DB Mirroring prerequisites for the source account/database, then restart Mirroring |
| Wrong **capacity ID** | Use the Fabric capacity GUID from Challenge 0, not the display name; confirm the workspace is assigned to that capacity |
| Cross-tenant identity issues | Keep Azure subscription, Cosmos DB, storage, and Fabric workspace in the same tenant for the RVAS path |
| Fabric asynchronous operation times out or fails | Read the operation error printed by the script, correct the underlying Fabric issue, and rerun the idempotent script |
| `metadata` vs `resource-metadata` naming confusion | The script creates shortcut `metadata`; the README's notebook section may call the domain `resource-metadata`. Verify the actual Challenge 2 container name and keep the path consistent before Challenge 4 |
| Mirrored table names differ from the guide | Check Cosmos DB containers from Challenge 1. Current setup script uses `conversations` and `interactions`; select `messages`/`feedback` only if those containers exist |

## Talking points (mini-briefing)

- **OneLake is the unifier.** The customer sees one Fabric data estate even when source data still
  lives in Azure storage or operational databases.
- **Shortcuts eliminate waste.** No duplicate storage bill, no egress-heavy copy, no stale export job.
  Fabric reads the ADLS Gen2 files already landed in Challenge 2.
- **Mirroring is near-real-time without connector glue.** Cosmos DB conversations flow into OneLake
  Delta tables so data engineers can query them like lake data.
- **This is the Bronze feed.** Challenge 4 will refine shortcut files and mirrored tables into Bronze,
  Silver, and Gold products for reliability, cost, and performance.
- **Identity is the enterprise control plane.** If RBAC is right, the pattern scales; if identity is
  wrong, every shortcut and mirror becomes a support ticket.

## If they finish early

- Explore **OneLake file explorer** and compare shortcut paths to the source ADLS Gen2 account.
- Inspect the mirrored Delta tables and note schema differences between Cosmos JSON and lake tables.
- Generate a new agent conversation and measure observed Mirroring latency.
- Open the imported notebooks and identify where each shortcut/mirrored table will feed Challenge 4.
- Sketch the Bronze table names they expect to create from each source.

## Reference assets

- [`resources/fabric-control-tower/README.md`](../resources/fabric-control-tower/README.md) — setup narrative, shortcuts, Mirroring, notebooks, pipelines
- [`resources/fabric-control-tower/src/setup/setup_fabric_workspace.py`](../resources/fabric-control-tower/src/setup/setup_fabric_workspace.py) — workspace, Lakehouse, shortcuts, notebook/pipeline import
- [`resources/fabric-control-tower/src/setup/setup_cosmos_mirroring.py`](../resources/fabric-control-tower/src/setup/setup_cosmos_mirroring.py) — mirrored database setup and status polling
- [`resources/fabric-control-tower/infra/main.bicep`](../resources/fabric-control-tower/infra/main.bicep) — storage, Key Vault, managed identity reference infrastructure
- [`docs/architecture.md`](../docs/architecture.md) — OneLake shortcuts + Mirroring in the overall Control Tower flow
