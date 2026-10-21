import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../app/App";
import { useGameStore } from "../state/gameStore";
import { closeDatabase } from "../storage/database";

type User = ReturnType<typeof userEvent.setup>;

/** Week 1 starts with the welcome message, which must be acknowledged in the Inbox. */
const startWeekAndAcknowledge = async (user: User) => {
  await user.click((await screen.findAllByRole("button", { name: "Start week" }))[0]);
  await user.click((await screen.findAllByRole("button", { name: "Read new messages" }))[0]);
  expect(await screen.findByRole("heading", { name: "Welcome to the planning team" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Acknowledge" }));
  // This week's incoming customer orders are information that also has to be read.
  await user.click(screen.getByRole("button", { name: /New customer orders for week 4/ }));
};

describe("app flow", () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    window.localStorage.clear();
    window.location.hash = "";
    useGameStore.setState({ initialized: false, game: null, scenario: null, saves: [], error: null });
  });
  afterEach(async () => {
    cleanup();
    await closeDatabase();
  });

  it("starts a game, runs planning, replans and commits", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.type(await screen.findByLabelText("Team name"), "Team Test");
    await user.click(screen.getByRole("button", { name: "Start new game" }));

    await startWeekAndAcknowledge(user);
    expect(screen.getAllByText("Analysis").length).toBeGreaterThan(0);
    await user.click(screen.getByRole("link", { name: "Dashboard" }));

    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);
    expect(await screen.findByText(/KPIs from PV-1-1/)).toBeInTheDocument();
    expect(screen.getByText(/WC200 is overloaded by 1 hours in period 3/)).toBeInTheDocument();

    // The working plan is the active mode until a plan is committed.
    expect(screen.getByText("WORKING PLAN")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Commit plan" })[0]);
    expect(await screen.findByText("LIVE PLAN")).toBeInTheDocument();
    expect(screen.getAllByText("Plan committed").length).toBeGreaterThan(0);

    // The game was saved automatically.
    await waitFor(() => expect(useGameStore.getState().saveStatus).toBe("saved"), { timeout: 2000 });
    expect(useGameStore.getState().saves).toHaveLength(1);
  });

  it("changes planning parameters of any item in Master data", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Team name"), "Team Master");
    await user.click(screen.getByRole("button", { name: "Start new game" }));
    await startWeekAndAcknowledge(user);
    await user.click(screen.getByRole("link", { name: "Master data" }));
    await user.click(await screen.findByRole("tab", { name: "Planning parameters" }));

    const rm4 = screen.getByLabelText("Safety stock RM4");
    await user.clear(rm4);
    await user.type(rm4, "80{Enter}");
    expect(await screen.findByText("(scenario: 30)")).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Supplier RM2"), "SUP-CENTRAL");

    const params = useGameStore.getState().game!.planningParameters;
    expect(params.RM4.safetyStock).toBe(80);
    expect(params.RM2.supplierId).toBe("SUP-CENTRAL");
    // The same values show in the form under the MRP record.
    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);
    await user.click(screen.getByRole("link", { name: "MRP" }));
    await user.click(within(await screen.findByRole("tablist", { name: "Item" })).getByRole("tab", { name: "RM4" }));
    expect(screen.getByRole("spinbutton", { name: "Safety stock" })).toHaveValue(80);
  });

  it("shows an MRP record with an explanation of a calculated cell", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Team name"), "Team MRP");
    await user.click(screen.getByRole("button", { name: "Start new game" }));
    await startWeekAndAcknowledge(user);
    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);

    await user.click(screen.getByRole("link", { name: "MRP" }));
    const tabs = await screen.findByRole("tablist", { name: "Item" });
    await user.click(within(tabs).getByRole("tab", { name: /RM1/ }));
    expect(await screen.findByRole("heading", { level: 2, name: /RM1 – Steel sheet/ })).toBeInTheDocument();

    const netCell = screen.getByRole("button", { name: /Net requirements, Period 3: 210/ });
    await user.click(netCell);
    expect(await screen.findByRole("heading", { name: "Calculation: Net requirements, period 3" })).toBeInTheDocument();
    // The item's place in the bill of materials is shown next to the calculation.
    const links = screen.getByRole("region", { name: "BOM links" });
    expect(within(links).getByText("Used in (up to the end products)")).toBeInTheDocument();
    expect(within(links).getByText(/Needed in period 3 by these parent orders/)).toBeInTheDocument();
  });

  it("simulates a week, shows the result and opens the next decision request as a dialog", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Team name"), "Team Loop");
    await user.click(screen.getByRole("button", { name: "Start new game" }));
    await startWeekAndAcknowledge(user);
    await user.click(screen.getByRole("link", { name: "Dashboard" }));

    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);
    // The dashboard sends the student to the orders instead of releasing them blindly.
    expect(screen.queryByRole("button", { name: /Release all due orders/ })).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Go to due orders (2)" }));
    expect(await screen.findByRole("heading", { name: "Planned production" })).toBeInTheDocument();
    const purchases = screen.getByRole("heading", { name: "Planned purchases" }).closest("section")!;
    // Both due orders this week are purchases (RM1 and RM4); release them one by one.
    for (const release of within(purchases).getAllByRole("button", { name: "Release" })) await user.click(release);
    expect(screen.queryByRole("button", { name: "Release" })).not.toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Commit plan" })[0]);
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    await user.click((await screen.findAllByRole("button", { name: "Simulate week" }))[0]);

    await user.click((await screen.findAllByRole("button", { name: "Review period result" }))[0]);
    expect(await screen.findByRole("heading", { name: "Week 1: planned versus actual" })).toBeInTheDocument();
    expect(screen.getByText("CO-1001")).toBeInTheDocument();

    await user.click(screen.getAllByRole("button", { name: "Start next week" })[0]);
    // The customer request needs a decision, so it opens as a dialog.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Request to increase order quantity")).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Accept" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    const game = useGameStore.getState().game;
    expect(game?.customerOrders.find((o) => o.id === "CO-1005")?.quantity).toBe(190);
    expect(game?.currentPeriod).toBe(2);
  });

  it("tries a customer request in a what-if plan and undoes the answer by discarding", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Team name"), "Team Request");
    await user.click(screen.getByRole("button", { name: "Start new game" }));
    await startWeekAndAcknowledge(user);
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);
    await user.click(await screen.findByRole("button", { name: /Go to due orders/ }));
    await user.click(await screen.findByRole("button", { name: /Release all due orders/ }));
    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Commit plan" })[0]);
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    await user.click((await screen.findAllByRole("button", { name: "Simulate week" }))[0]);
    await user.click((await screen.findAllByRole("button", { name: "Review period result" }))[0]);
    await user.click(screen.getAllByRole("button", { name: "Start next week" })[0]);

    // The pop-up says the answer is final and how to try it first.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/choose Read later and open the request from the Inbox/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Read later" }));
    await user.click(screen.getByRole("link", { name: /Inbox/ }));
    await user.click(screen.getByRole("button", { name: /New customer orders for week 5/ }));
    await user.click(screen.getByRole("button", { name: /Request to increase order quantity/ }));
    expect(screen.getByText(/Your answer here is final/)).toBeInTheDocument();

    // No planning run this week yet: starting the what-if plans the live game first.
    await user.click(screen.getByRole("button", { name: "Explore in a what-if plan" }));
    expect(await screen.findByText(/Your answer only applies to this what-if plan/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Review planning before deciding" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Accept" }));
    expect(await screen.findByText(/Answered in the what-if plan: Accept/)).toBeInTheDocument();
    // There is no way to carry the branch over; the student redoes the decision in the live plan.
    expect(screen.queryByRole("button", { name: /Apply/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Your changes in this what-if/)).toBeInTheDocument();

    const banner = screen.getByRole("region", { name: "WHAT-IF PLAN" });
    await user.click(within(banner).getByRole("button", { name: "Run planning" }));
    expect(await within(banner).findByRole("button", { name: /Hide comparison PV-2-1 → PV-2-2/ })).toBeInTheDocument();

    await user.click(within(banner).getByRole("button", { name: "End what-if and return to the live plan" }));
    await waitFor(() => expect(useGameStore.getState().game?.whatIf).toBeUndefined());
    const live = useGameStore.getState().game!;
    expect(live.customerOrders.find((o) => o.id === "CO-1005")?.quantity).toBe(150);
    expect(await screen.findByText(/Your answer here is final/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Accept" })).toBeInTheDocument();
  });

  it("explores a what-if plan and discards it without changing the live game", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Team name"), "Team WhatIf");
    await user.click(screen.getByRole("button", { name: "Start new game" }));
    await startWeekAndAcknowledge(user);
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);

    await user.click(screen.getByRole("button", { name: "Start what-if" }));
    expect(await screen.findByText("You are exploring a what-if plan")).toBeInTheDocument();
    expect(screen.getAllByText("WHAT-IF PLAN").length).toBeGreaterThan(0);
    const commit = screen.getAllByRole("button", { name: "Commit plan" })[0];
    expect(commit).toBeDisabled();
    expect(screen.getByText(/Make a change, for example a customer order request/)).toBeInTheDocument();

    // Change something in the branch and replan there.
    await user.click(screen.getByRole("link", { name: "Capacity" }));
    await user.click(await screen.findByRole("tab", { name: /WC200/ }));
    const overtime = screen.getByLabelText("Overtime WC200 Period 3");
    await user.clear(overtime);
    await user.type(overtime, "2{Enter}");
    const banner = screen.getByRole("region", { name: "WHAT-IF PLAN" });
    await user.click(within(banner).getByRole("button", { name: "Run planning" }));
    expect(await screen.findByText(/Overload WC200: 1.0 h → 0.0 h/)).toBeInTheDocument();
    expect(screen.queryByText(/Make a change, for example a customer order request/)).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "End what-if and return to the live plan" }));
    await waitFor(() => expect(screen.queryByText("You are exploring a what-if plan")).not.toBeInTheDocument());
    const live = useGameStore.getState().game!;
    expect(live.whatIf).toBeUndefined();
    expect(live.workCenterCapacity).toEqual([]);
    expect(live.decisions.at(-1)?.category).toBe("DISCARD_WHAT_IF");
  });

  it("keeps an overtime draft on its own work centre when switching tab without a blur", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Team name"), "Team Tabs");
    await user.click(screen.getByRole("button", { name: "Start new game" }));
    await startWeekAndAcknowledge(user);
    await user.click(screen.getByRole("link", { name: "Dashboard" }));
    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);
    await user.click(screen.getByRole("link", { name: "Capacity" }));
    await user.click(await screen.findByRole("tab", { name: /WC200/ }));
    const overtime = screen.getByLabelText("Overtime WC200 Period 3");
    await user.clear(overtime);
    await user.type(overtime, "2");
    // Safari does not focus a clicked button, so the input gets no blur: simulate with a bare click.
    fireEvent.click(screen.getByRole("tab", { name: /WC300/ }));

    expect(await screen.findByLabelText("Overtime WC300 Period 3")).toHaveValue(0);
    const capacity = useGameStore.getState().game!.workCenterCapacity;
    expect(capacity).toEqual([expect.objectContaining({ workCenterId: "WC200", period: 3, overtimeHours: 2 })]);
  });

  it("shows reports with score parts and exports after a simulated week", async () => {
    const { commitPlan, createGameState, latestVersion, runPlanningVersion, startPeriod } = await import(
      "../engine/game/gameActions"
    );
    const { releaseAllDueOrders } = await import("../engine/game/orderActions");
    const { simulatePeriod } = await import("../engine/game/weekFlow");
    const { takeInMessages, FIXED_TIME } = await import("./fixtures");
    const { loadScenario } = await import("../scenarios");
    const scenario = loadScenario("standard");
    let game = takeInMessages(
      startPeriod(createGameState(scenario, { gameId: "g-r", teamName: "Team R", randomSeed: 2, now: FIXED_TIME }), scenario, FIXED_TIME),
    );
    game = runPlanningVersion(game, scenario, FIXED_TIME);
    game = releaseAllDueOrders(game, scenario, FIXED_TIME);
    game = runPlanningVersion(game, scenario, FIXED_TIME);
    game = simulatePeriod(commitPlan(game, latestVersion(game)!.id, FIXED_TIME), scenario, FIXED_TIME);
    useGameStore.setState({ game, scenario });
    window.location.hash = "#/reports";
    render(<App />);

    expect(await screen.findByRole("heading", { name: "Total score" })).toBeInTheDocument();
    expect(screen.getByText("Delivery (service level)")).toBeInTheDocument();
    expect(screen.getByText("Plan adherence")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "KPI history (CSV)" })).toBeInTheDocument();
  });

  it("lets a teacher load an exported game in the instructor review", async () => {
    const { buildExportFile, serializeExportFile } = await import("../importExport/exportGame");
    const { createGameState } = await import("../engine/game/gameActions");
    const { loadScenario } = await import("../scenarios");
    const game = createGameState(loadScenario("standard"), {
      gameId: "g-review",
      teamName: "Team Review",
      randomSeed: 1,
      now: "2026-01-05T08:00:00.000Z",
    });
    const text = serializeExportFile(buildExportFile(game, "2026-01-05T09:00:00.000Z"));
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: "Open instructor review" }));
    expect(await screen.findByRole("heading", { name: "Instructor review" })).toBeInTheDocument();
    await user.upload(screen.getByLabelText("Game files"), [
      new File([text], "team-review.mpcgame", { type: "application/json" }),
      new File(["{broken"], "broken.mpcgame", { type: "application/json" }),
    ]);
    expect(await screen.findByRole("button", { name: "Team Review" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("broken.mpcgame");
    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(await screen.findByRole("heading", { name: "Start a planning game" })).toBeInTheDocument();
  });
});
