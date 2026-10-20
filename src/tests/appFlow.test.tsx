import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
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
  });

  it("simulates a week, shows the result and opens the next decision request as a dialog", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Team name"), "Team Loop");
    await user.click(screen.getByRole("button", { name: "Start new game" }));
    await startWeekAndAcknowledge(user);
    await user.click(screen.getByRole("link", { name: "Dashboard" }));

    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);
    await user.click(await screen.findByRole("button", { name: /Release all due orders/ }));
    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);
    await user.click(screen.getAllByRole("button", { name: "Commit plan" })[0]);
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

    // Change something in the branch and replan there.
    await user.click(screen.getByRole("link", { name: "Capacity" }));
    await user.click(await screen.findByRole("tab", { name: /WC200/ }));
    const overtime = screen.getByLabelText("Overtime WC200 Period 3");
    await user.clear(overtime);
    await user.type(overtime, "2{Enter}");
    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);
    expect(await screen.findByText(/Overload WC200: 1.0 h → 0.0 h/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Discard what-if" }));
    await waitFor(() => expect(screen.queryByText("You are exploring a what-if plan")).not.toBeInTheDocument());
    const live = useGameStore.getState().game!;
    expect(live.whatIf).toBeUndefined();
    expect(live.workCenterCapacity).toEqual([]);
    expect(live.decisions.at(-1)?.category).toBe("DISCARD_WHAT_IF");
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
