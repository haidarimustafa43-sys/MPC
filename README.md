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

| Phase | Content | Status |
| --- | --- | --- |
| 1 – Foundation | Project structure, GitHub Pages config, domain model, scenario loading + validation, GameState, IndexedDB storage, navigation, dashboard | ✅ done |
| 2 – Planning | BOM explosion, MPS, MRP, lot sizing, ATP, CRP, RCCP, constraint engine, planning versions + comparison | ✅ done |
| 3 – Game loop | Inbox, pop-ups, event engine, decision log UI, commit → **simulate week** → review | ⏳ next (event data already in the scenario) |
| 4 – Pedagogy | Calculation traces / explanation panel (basic version done), what-if mode, reports | partly |
| 5 – Distribution | Export/import `.mpcgame`, Instructor Review | ⏳ |

What a student can do today: start a game, start week 1, run planning, inspect MPS / MRP /
CRP / RCCP / inventory / orders, click calculated cells for an explanation, change safety
stock, safety lead time, lot-sizing method and parameters, supplier, overtime and external
capacity (each change is logged with an optional reason), rerun planning, compare planning
versions KPI by KPI, and commit the plan. The game is saved automatically in the browser.
"Simulate week" is visible but disabled until phase 3.

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
```

## Publishing on GitHub Pages

1. Push the repository to GitHub (branch `main`).
2. In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Every push to `main` runs `.github/workflows/deploy.yml`: `npm ci` → type check → tests →
   build → deploy `dist/` to Pages.
4. Open `https://<user>.github.io/<repository>/`.

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
  pages/          Start, Dashboard, MPS, MRP, Capacity, Inventory, Orders, Planning versions, Master data, Settings
  domain/         Pure TypeScript types (Item, BomLine, RoutingOperation, WorkCenter, Supplier, orders, events, GameState, PlanningVersion, KPIs, constraints)
  engine/
    planningInput.ts          builds the pure planning input (parameters applied)
    mps/                      calculateMps, calculateAtp
    mrp/                      explodeBom, lotSizing, timePhaseOrders (netting core), calculateMrp
    capacity/                 capacityAvailability, calculateCrp, calculateRccp
    inventory/                time-phasing of scheduled receipts and customer demand
    constraints/              evaluateConstraints
    scoring/                  calculateKpis
    planning/                 runPlanning (MPS → MRP → CRP/RCCP → constraints → KPIs), compareVersions
    game/                     stateMachine (weekly flow), gameActions (pure GameState transitions)
  state/          Zustand store (autosave, central error handling), selectors
  storage/        IndexedDB (idb), save repository, migrations, localStorage preferences
  scenarios/      standard/*.json, Zod schema, referential validation, registry
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
- **Released production orders are assumed to have their material issued already**, so they
  create no further component demand.
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
- Started (`IN_PROGRESS`) orders: operations scheduled before the current period are
  treated as done. Released but not started orders: that work is loaded in the current period.
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
committed. Severity: INFO, WARNING, CRITICAL, BLOCKING (blocking = cannot commit).

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

Guards: no planning before the week starts; no commit of a stale plan, an older version or a
plan with blocking problems; no simulation with unanswered required messages, without a
committed plan, or when the committed plan does not match the latest change. Invalid
transitions throw and are shown as a readable message.

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
1. Copy `src/scenarios/standard/` to a new folder and edit the JSON.
2. Register it in `src/scenarios/index.ts` (one entry in `rawScenarios`).
3. Run `npm run test`: the scenario is validated with the Zod schema in
   `src/scenarios/schema.ts` plus referential checks (unknown items, work centres,
   suppliers, duplicate ids, cyclic BOMs). Errors name the exact path, e.g.
   `items.0.lotSizingPolicy.quantity: Required`.

### Event structure
Events are data (`events.json`) with `trigger` (period start/end/range, state-based or
random), `probability`, `message` (sender, severity, type, bilingual title/body), optional
`choices`, `effects` (e.g. `DELAY_PURCHASE_ORDER`, `CHANGE_CAPACITY`,
`CHANGE_CUSTOMER_ORDER_QUANTITY`), delayed effects and follow-ups. They are validated now;
the event engine that applies them is phase 3. Effects change the planning conditions, never
the result.

## Saved games

Games are stored automatically in **IndexedDB** in the student's browser (debounced
autosave). The start page lists saved games and supports open, rename, duplicate and delete;
Settings can restart the scenario. Only the language and the active game id are kept in
`localStorage`. Each save carries `saveFileVersion`; `storage/migrations.ts` validates
required fields, rejects newer or broken saves with a readable message and is where
migrations for future versions go. Export/import as `.mpcgame` files follows in phase 5.

## Known limitations

- Weeks cannot be simulated yet; the game stays in week 1 (phase 3).
- No inbox or event engine yet; scenario events are validated but not triggered.
- Planned orders cannot yet be moved, firmed or released manually; changes are made through
  planning parameters, supplier choice and capacity.
- MRP uses weekly buckets and integer rounding per order; no pegging view yet.
- RCCP ignores setups and lead-time offset by design.

## Planned improvements

Phase 3 (inbox, pop-ups, event engine, order release/move, simulate week, week review),
phase 4 (richer explanations, what-if branch, reports), phase 5 (export/import,
Instructor Review, CSV export of histories).
