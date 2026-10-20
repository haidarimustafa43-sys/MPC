# MPC Planning Game

A backend-free, browser-based teaching game for university courses in production planning
(MPS, MRP, CRP/RCCP, ATP). Students plan week by week in a simplified, transparent
planning system and learn that **a plan is not static**: new information arrives, problems
appear, and the plan has to be recalculated, compared and committed again.

> **This is a teaching tool, not a real ERP system.** The calculations are deliberately
> simplified and fully explained. Do not use it for real production control.

All application text is in English; a Swedish translation is included (Settings → Language).

![Dashboard screenshot placeholder](docs/screenshot-dashboard.png)
![MRP screenshot placeholder](docs/screenshot-mrp.png)

## Status

All five phases of the specification are implemented:

| Phase | Content |
| --- | --- |
| 1 – Foundation | Project structure, GitHub Pages configuration, domain model, scenario loading and validation, GameState, IndexedDB storage, navigation, dashboard |
| 2 – Planning | BOM explosion, MPS, MRP, lot sizing, ATP, CRP, RCCP, constraint engine |
| 3 – Game loop | Event engine, inbox and pop-ups, order decisions, decision log, planning versions, commit → simulate week → week review → next week |
| 4 – Pedagogy | Calculation traces and explanation panel, detailed plan comparison, what-if planning, reports with KPI history and a transparent score |
| 5 – Distribution | `.mpcgame` export/import, CSV/JSON exports, Instructor Review, scenario import and JSON Schema, GitHub Actions |

### What students do

Each week the student starts the week and receives the events (critical news and decision
requests open as a dialog and are kept in the Inbox), acknowledges or answers them, runs
planning and inspects MPS / MRP / CRP / RCCP / inventory / orders. Every calculated cell can
be clicked for an explanation generated from the calculation itself. The student changes
safety stock, safety lead time, lot sizing, supplier, overtime, external capacity, forecast
(outside the time fence) and planned orders (release, move, change quantity, cancel, express
delivery, accept/reject customer orders), can try ideas in a **what-if plan** first, reruns
and compares planning versions, commits a plan and simulates the week. The week review shows
the realised outcome against the plan; Reports show the development over all weeks. Every
decision is logged with an optional reason, and the game is saved automatically in the
browser and can be exported as a file for the teacher.

### What teachers do

Teachers load the students' exported `.mpcgame` files in **Instructor Review** (locally, no
upload) to compare KPIs, decisions with reasons, events and planning iterations per team.
They can create their own scenarios as JSON (template download, JSON Schema, validation) and
import them in the browser.

## Running locally

Requires Node.js 20+ (CI uses 22).

```bash
npm install
npm run dev        # http://localhost:5173
npm run test       # Vitest unit, integration and UI tests
npm run typecheck  # strict TypeScript
npm run lint
npm run build      # type check + production build into dist/
npm run preview    # serve the production build
npm run schema     # regenerate public/scenario.schema.json after schema changes
```

## Publishing on GitHub Pages

Every push to `main` and every pull request runs `.github/workflows/deploy.yml` as CI:
`npm ci` → type check → lint → tests → build. **Publishing is manual**, so nothing goes
live by accident:

1. Push the repository to GitHub (branch `main`). On the free GitHub plan the repository
   must be public for Pages.
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → CI and GitHub Pages → Run workflow** (branch `main`). This run also uploads
   `dist/` and deploys it.
4. Open `https://<user>.github.io/<repository>/`.

To deploy automatically on every push instead, remove the two
`if: github.event_name == 'workflow_dispatch'` lines in the workflow.

Base path: `vite.config.ts` uses a **relative base (`./`)**, so the same build works locally,
on a user page (`user.github.io`) and in a project repository (`user.github.io/MPC/`) without
hard-coding the repository name. If you need an absolute base, set `VITE_BASE_PATH=/MPC/` for
the build. Routing uses `HashRouter` (`#/mrp`), so reloading a page never gives a 404.
Scenario JSON is bundled at build time, so no runtime request depends on the base path.

## Architecture

```
src/
  app/            App, router (HashRouter)
  components/     layout, common (badges, lists), tables, charts, planning (record view, explanation, parameter form)
  pages/          Start, Dashboard, Inbox, MPS, MRP, Capacity, Inventory, Orders, Planning versions,
                  Week results, Decision log, Reports, Master data, Settings, Instructor review
  domain/         Pure TypeScript types (Item, BomLine, RoutingOperation, WorkCenter, Supplier, orders, events, GameState, PlanningVersion, KPIs, constraints)
  engine/
    planningInput.ts          builds the pure planning input (parameters applied)
    mps/                      calculateMps, calculateAtp
    mrp/                      explodeBom, lotSizing, timePhaseOrders (netting core), calculateMrp
    capacity/                 capacityAvailability, calculateCrp, calculateRccp
    inventory/                time-phasing of scheduled receipts and customer demand
    constraints/              evaluateConstraints
    events/                   triggers, effects, seeded rolls, processEvents
    simulation/               receiveOrders, completeProduction, fulfillCustomerOrders, simulateWeek
    scoring/                  projected KPIs, realised totals, score, game summary
    planning/                 runPlanning (MPS → MRP → CRP/RCCP → constraints → KPIs), compareVersions
    game/                     stateMachine, gameActions, orderActions, inboxActions, weekFlow, whatIf
  importExport/   .mpcgame export, import validation, CSV/JSON exports
  state/          Zustand store (autosave, what-if branch, central error handling), selectors
  storage/        IndexedDB (idb): saves and custom scenarios, migrations, localStorage preferences
  scenarios/      standard/*.json, Zod schema, JSON Schema, referential validation, registry
scripts/          generateScenarioSchema.ts (npm run schema)
public/           scenario.schema.json, favicon
  i18n/           en, sv
  tests/          fixtures, UI flow tests
```

Design rules:

- **Engines are pure functions** (`runPlanning(input) → result`); they never touch React or
  browser storage. Same input → same output.
- **GameState** holds the game; calculated results are only stored as immutable
  `PlanningVersion` snapshots (the input snapshot is kept with each version).
- **All game changes go through `engine/game/gameActions.ts`**, which uses the state machine
  for every transition and logs every decision.
- **Scenario data lives in JSON**, never in components; no scenario ids are hard-coded in the
  engines.
- The constraint engine **reports problems but never solves them** and never says what to
  move where. It can list contributing orders.

## Planning rules and assumptions

All rules are implemented in the engine files named in brackets.

### Planning horizon
The horizon starts at the current week and covers `planningHorizonPeriods` (8) periods.
Anything dated before the current period (past-due receipts or customer orders) is placed in
the first period and reported. [`inventory/projectInventory.ts`]

### MPS and forecast consumption [`mps/calculateMps.ts`]
- Inside the **demand time fence** (`demandTimeFencePeriods`, 2 periods from the current
  week) only customer orders count.
- Outside it, **total demand = max(forecast, customer orders)**: customer orders consume
  the forecast; only orders above forecast add demand.
- End items are then netted, lot-sized and offset exactly like MRP items (MPS receipt / MPS
  release).

### ATP [`mps/calculateAtp.ts`]
Discrete ATP without look-ahead: in each period with supply (MPS receipt or scheduled
receipt; the first period always counts and includes on hand),
`ATP = on hand (first period) + supply − customer orders until the next supply`.
A negative ATP is covered by the previous supply period. Forecast never consumes ATP.

### Netting (MPS and MRP) [`mrp/timePhaseOrders.ts`]
- `net requirement(t) = gross(t) + safety stock − (PAB(t−1) + scheduled receipts(t))`, if positive.
- `PAB(t) = PAB(t−1) + scheduled receipts(t) + planned receipts(t) − gross(t)`.
- Planned receipt = lot size, placed `safetyLeadTime` periods before the need; planned
  release = receipt − lead time.
- **Nothing can be released before the current period.** If the safety lead time would push
  the release into the past it is compressed (warning). If the need lies inside the lead time
  itself, no order can cover it: the shortage carries forward, the cells are marked, and the
  first feasible order covers the backlog. This is how a supplier delay becomes visible as a
  material shortage.
- On-hand = on hand − allocated, summed over warehouses.

### BOM explosion [`mrp/explodeBom.ts`, `mrp/calculateMrp.ts`]
- Multi-level, processed by **low-level code** (deepest occurrence of an item).
- Component gross requirement = parent planned order release × quantity per × (1 + scrap
  rate), rounded up per order, in the parent's release period. BOM effectivity windows refer
  to the parent's release period.
- **Released production orders that have not started** still need their components: their
  component quantities are a gross requirement in the current period (an allocation). Started
  orders already have their material.
- **Firm planned orders** (orders moved or changed by the student) are kept as they are and
  exploded like other planned orders. Up to the latest firm order of an item, MRP does not add
  orders of its own (firm zone), so moving an order later shows the gap instead of being
  silently replanned.
- Cyclic BOMs, unknown items, purchased parents and invalid quantities are reported as
  validation errors; a cyclic BOM blocks planning.

### Lot sizing [`mrp/lotSizing.ts`]
| Method | Rule |
| --- | --- |
| LFL | Q = net requirement |
| FOQ | Q = ceil(net / FOQ) × FOQ |
| FPR | Q = net + Σ(gross − scheduled) of the following n − 1 periods (never less than net) |
| POQ | n = round(EOQ / D), at least 1, then as FPR |
| EOQ | Q = max(net, ceil(√(2·D·S / H))) |
| MULTIPLE | Q = ceil(max(net, minimum) / multiple) × multiple |

EOQ/POQ assumptions: D = average gross requirement per period over the remaining horizon,
S = item order cost, H = holding cost per unit and period. Without positive D, S and H the
method falls back to LFL (shown in the explanation).

### Supplier selection
For purchased items the chosen supplier's `normalLeadTimePeriods` replaces the item lead
time, and its `unitCostModifiers[item]` multiplies the standard cost in material cost.

### CRP [`capacity/calculateCrp.ts`]
- `capacity load = setup time per order + order quantity / yield × run time per unit`.
- Loaded orders: planned production orders and released production orders.
- Operations are spread evenly over the order's lead time: operation k of n is loaded in
  `release + floor(k · leadTime / n)`.
- Finished operations (`completedOperations`, kept by the simulation) are not loaded.
  Remaining work scheduled before the current period is loaded in the current period.
- `available = normal × capacity factor (events) + overtime (capped at the limit) + external hours`.

### RCCP [`capacity/calculateRccp.ts`]
Bill of resources = run hours per end-item unit, exploded over all manufactured components
(no setups, no lead-time offset); load = (MPS receipts + scheduled receipts) × hours per unit.
Kept separate from the detailed CRP on purpose.

### Constraints [`constraints/evaluateConstraints.ts`]
Projected inventory below zero, below safety stock, missing material (with the parent orders
that need it), late planned release (compressed safety lead time), release due now, past-due
order, work-centre overload (with contributing orders), customer order at risk / late,
supplier unavailable, invalid BOM, missing routing, plan not recalculated, plan not
committed, firm planned order past its release date, firm order changed inside the frozen
zone (`frozenZonePeriods`), and a message waiting for a decision. Severity: INFO, WARNING, CRITICAL, BLOCKING (blocking = cannot commit).

### Projected KPIs [`scoring/calculateKpis.ts`]
Over the planning horizon:
- holding cost = Σ max(0, PAB) × holding cost per unit and period (all items);
- order cost = number of new planned orders × item order cost;
- material cost = planned purchase quantity × standard cost × supplier modifier;
- overtime cost = overtime hours × work-centre rate; external capacity = hours × scenario rate;
- revenue = open customer orders due in the horizon that are not at risk;
- late order cost = quantity of late or at-risk orders × `lateCostPerUnitPeriod` (one period assumed);
- net contribution = revenue − all costs above;
- service level = share of open customer orders in the horizon that are neither late nor at risk;
- average inventory value = average over periods of Σ max(0, PAB) × standard cost;
- overloaded work-centre periods, overload hours, shortage units, planning iterations.

The comparison view shows each KPI as better / worse / unchanged; no single total score is
used, because the trade-offs (e.g. safety stock vs. holding cost) are the point.

## Weekly flow (state machine) [`engine/game/stateMachine.ts`]

`NOT_STARTED → PERIOD_START → (EVENTS_PENDING →) ANALYSIS → PLANNING_DIRTY ⇄ PLAN_CALCULATED → PLAN_COMMITTED → PERIOD_SIMULATED → PERIOD_REVIEW → PERIOD_START …`

Guards: no planning before the week's messages are read and the required ones acknowledged;
no commit of a stale plan, an older version or a plan with blocking problems; no simulation
with an unanswered decision request, without a committed plan, or when the committed plan
does not match the latest change. A decision request may stay open while the student
analyses the plan ("Review planning before deciding"). Invalid transitions throw and are
shown as a readable message. After the last week the game is `GAME_COMPLETED`.

## Order decisions [`engine/game/orderActions.ts`]

- **Release**: planned orders whose release date has come (≤ current week) can be released.
  Due period = max(planned receipt, today + lead time). The order cost is booked at release.
  Releasing changes the plan, so planning has to be rerun before committing. Planned orders
  that are due but not released do not happen; the week review lists them.
- **Move earlier / later, change quantity**: creates a firm planned order. Its release
  (receipt − lead time) may not lie in the past.
- **Express delivery**: an open purchase order arrives `leadTimeReductionPeriods` earlier
  (never before today) for `costPerUnit` × quantity, once per order.
- **Accept / reject** proposed customer orders.

## Week simulation [`engine/simulation/`]

For the committed plan, in this order:
1. Purchase orders due this week (after any delay) are received; material cost =
   quantity × standard cost × supplier modifier.
2. Production orders whose work is done and whose due week has come go into stock.
3. Released orders whose release week has come get their components. An order starts only if
   **all** components are available; otherwise it waits one week (material shortage).
   Earlier due dates get material first. If the scenario sets `allowPartialProduction`, the
   part that has material starts and the rest becomes a new order one week later.
4. Operations scheduled up to this week are performed within the available capacity
   (normal × event factor + overtime + external). Operations are not split: one that does not
   fit delays its order by a week (capacity shortage). Earlier due dates first.
5. Orders finished this week whose due week has come go into stock.
6. Customer orders due up to this week are delivered from stock, oldest first; partial
   deliveries are allowed. Anything still owed at the end of its due week is LATE.
7. Costs and KPIs: revenue (delivered × price), material, order cost (booked at release),
   holding (end stock × holding cost), overtime, external capacity, express, late cost
   (units still owed × `lateCostPerUnitPeriod`, every week they are late), net contribution,
   service level (order lines due this week delivered complete and on time).

Each failure is labelled **"known problem in the committed plan"** when the plan already
showed a matching problem (e.g. MISSING_MATERIAL for that item, WORK_CENTER_OVERLOAD for that
work centre), otherwise **"not visible in the committed plan"**. The result is stored as an
immutable `PeriodResult` (receipts, starts, completions, deliveries, failures, events,
planned vs. actual stock, end inventory, KPIs).

## What-if planning [`engine/game/whatIf.ts`]

"Start what-if" copies the live game into a temporary branch. Everything the student does
there (answer a request, change parameters, move orders, run planning) happens in the copy;
the live game is not changed and not saved meanwhile. The branch can be compared with the
live plan, then **applied** (it becomes the live game, its planning versions are marked
WHAT-IF and one APPLY entry is logged) or **discarded** (only a DISCARD entry is logged).
Committing, simulating and changing week are blocked inside a branch. The branch lives in
memory only: reloading the page discards it.

## Explanations and comparison

- Clicking a calculated MPS/MRP cell opens an explanation built from the calculation trace:
  net requirement, lot size (method and parameters), planned receipt, release (lead-time
  offset), projected balance, MPS demand (time-fence rule), **gross requirements with pegging**
  to the parent orders that cause them, and **ATP** with the periods it covers.
- Comparing two planning versions shows, before the KPI table, the concrete problems: number
  of warnings and critical problems, overload hours per work centre and largest shortage per
  item (e.g. `Overload WC200: 14 h → 4 h`, `Projected shortage RM2: 80 → 0`). Each KPI is
  marked better/worse on its own; no KPI is assumed to be the most important.

## Reports and score [`engine/scoring/`]

Reports show realised service level and net contribution per week (and cumulated), costs per
week by type, inventory value and holding cost next to the service level (the safety-stock
trade-off), the realised totals, and exports. The **total score** is illustrative and always
shown with its parts and formulas; the weights are scenario data (`settings.scoring`):

- delivery = `deliveryWeight × realised service level`;
- financial = `financialWeight × min(1, net contribution / (referenceNetContributionPerPeriod × weeks))`;
- plan adherence = `planAdherenceWeight × weeks without a failure that the committed plan
  already showed / weeks`.

It is meant for discussion, not grading.

## Forecast changes

If the scenario sets `forecastEditable`, the forecast cells of the MPS after the demand time
fence are editable. Each change is a logged decision; inside the fence only customer orders
count, so changes there are refused.

## Event engine [`engine/events/`]

At the start of each week: effects scheduled for this week (delayed effects, supplier
recovery) and follow-up events are applied, then every event whose trigger matches fires.
Period-end triggers run after the simulation. Each event fires at most once and only when its
`prerequisites` have fired. Triggers: `PERIOD_START`, `PERIOD_END`, `PERIOD_RANGE`,
`RANDOM`, `INVENTORY_BELOW`, `UTILIZATION_ABOVE` (committed plan of the previous week),
`SERVICE_LEVEL_BELOW` (realised), `DECISION_TAKEN`.

`probability` < 1 is decided by a seeded roll per event and week, according to the scenario's
`eventMode`: `fixed` (same for all teams), `seeded` (reproducible per team via
`randomSeed`) or `random` (new entropy each time). Effects only change conditions
(purchase-order dates, capacity factors, customer orders, supplier availability, stock), so
the same event hurts a team with low stock and not one that built safety stock.

## Scenario structure

`src/scenarios/standard/` contains one JSON file per data type:
`scenario.json` (id, version, bilingual name/description, settings, warehouses), `items.json`,
`bom.json`, `routings.json`, `workCenters.json`, `suppliers.json`, `forecasts.json`,
`customerOrders.json`, `openOrders.json` (released production and purchase orders) and
`events.json`.

The standard scenario: end items A and B; manufactured C1 Frame, C2 Drive unit, C3 Housing
(C3 is used on two levels); purchased RM1–RM4 (RM2 from Supplier North or Supplier Central);
work centres WC100, WC200, WC300; 16 periods of forecast; customer orders from Customer
Alpha and Customer Beta; open production and purchase orders; four events (welcome,
customer request in week 2, RM2 delay in week 3, WC200 breakdown in week 4).

### Creating a new scenario

**Without programming (in the browser):**
1. Start page → **Download the standard scenario as a template** (`standard-scenario.json`).
2. Edit it (give it a new `id`). `public/scenario.schema.json` (also published next to the
   app) gives autocompletion and checks in editors such as VS Code:
   add `"$schema": "./scenario.schema.json"` or associate the file in the editor.
3. Start page → **Import a scenario (JSON)**. It is validated (schema plus referential checks:
   unknown items/work centres/suppliers, duplicate ids, cyclic BOMs) and then selectable in this
   browser. Exported games of custom scenarios carry the scenario, so the teacher can review them.

**Built into the application:**
1. Copy `src/scenarios/standard/` to a new folder and edit the JSON files.
2. Register it in `src/scenarios/index.ts` (one entry in `rawScenarios`).
3. Run `npm run test`. Errors name the exact path, e.g. `items.0.lotSizingPolicy.quantity: Required`.
   After changing `src/scenarios/schema.ts`, run `npm run schema` to regenerate the JSON Schema
   (a test fails if it is out of date).

### Event structure
Events are data (`events.json`) with `trigger` (period start/end/range, state-based or
random), `probability`, `message` (sender, severity, type, bilingual title/body), optional
`choices`, `effects` (e.g. `DELAY_PURCHASE_ORDER`, `CHANGE_CAPACITY`,
`CHANGE_CUSTOMER_ORDER_QUANTITY`, `ADD_CUSTOMER_ORDER` with status ACCEPTED or PROPOSED,
`SUPPLIER_UNAVAILABLE`, `SCRAP_INVENTORY`), delayed effects and follow-ups. A choice with
`"defersDecision": true` keeps the request open. To add an event, append it to
`events.json` and run `npm run test`; the schema reports mistakes.

In the standard scenario the events are tuned so that a planner who simply releases what MRP
suggests still meets them: the RM2 delay (week 3) leaves RM2 short by about 50 units in
period 4, and the WC200 breakdown (−40 % in periods 4–6) overloads WC200 by about 11 hours in
period 6.

## Saved games, export and import

Games are stored automatically in **IndexedDB** in the student's browser (debounced
autosave). The start page lists saved games and supports open, rename, duplicate and delete;
Settings can restart the scenario. Only the language and the active game id are kept in
`localStorage`. Each save carries `saveFileVersion`; `storage/migrations.ts` upgrades
older saves (v1 → v2 is included) and rejects newer or broken ones with a readable message.

### `.mpcgame` files [`importExport/`]

Settings → **Export game** downloads the whole game as `<team>_<scenario>_week<n>.mpcgame`.
Technically it is JSON:

```json
{
  "format": "mpc-planning-game",
  "schemaVersion": 1,
  "exportedAt": "2026-10-16T12:00:00.000Z",
  "applicationVersion": "1.0.0",
  "scenarioId": "standard",
  "scenarioVersion": "1.0.0",
  "checksum": "1a2b3c4d",
  "gameState": { "...": "the complete GameState" },
  "scenario": { "...": "only for scenarios that are not built in" }
}
```

The checksum (FNV-1a over the serialised game state) detects accidental damage or editing; it
is not a security feature. Import (start page) only parses JSON, never executes anything,
and checks size, format, schema version, required fields, checksum, scenario availability
(built-in or embedded and valid), save migration and the structure of the game state. Errors
are shown in plain language. An import never overwrites a game in the browser: a clashing id
gets a new one.

Reports → **Export data** gives KPI history, decision log, orders and inventory history as
CSV, or everything as JSON.

### Instructor Review

Start page (or Settings) → **Open instructor review**. Select one or more `.mpcgame` files;
they are read in the browser only and nothing is stored. The overview shows per team:
scenario, final week, completed or not, service level, net contribution, holding and
overtime cost, late orders, planning iterations, decisions and the illustrative score, plus
comparison charts. The detail view lists major decisions with the students' reasons, events
and answers, planning versions per week, decisions per category and the outcome of each week.
There is no ranking and no automatic grade.

## Known limitations

- Supplier reliability is not simulated randomly; deliveries change only through events, so
  every team meets the same conditions.
- A what-if branch is kept in memory only; reloading the page discards it.
- MRP uses weekly buckets and integer rounding per order; RCCP ignores setups and lead-time
  offset by design.
- Custom scenarios and saved games live in the browser where they were created (export files
  move them).
- The score is illustrative; it is not calibrated for grading.

## Planned improvements

The application is complete according to the specification. The next step is feedback from
the examiners who use it in their courses; typical extensions would be more scenarios, more
event types, a visual scenario editor and additional languages.
