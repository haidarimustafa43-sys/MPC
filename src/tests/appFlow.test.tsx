import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { App } from "../app/App";
import { useGameStore } from "../state/gameStore";
import { closeDatabase } from "../storage/database";

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

    await user.click((await screen.findAllByRole("button", { name: "Start week" }))[0]);
    expect(screen.getAllByText("Analysis").length).toBeGreaterThan(0);

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
    await user.click((await screen.findAllByRole("button", { name: "Start week" }))[0]);
    await user.click(screen.getAllByRole("button", { name: "Run planning" })[0]);

    await user.click(screen.getByRole("link", { name: "MRP" }));
    const tabs = await screen.findByRole("tablist", { name: "Item" });
    await user.click(within(tabs).getByRole("tab", { name: /RM1/ }));
    expect(await screen.findByRole("heading", { level: 2, name: /RM1 – Steel sheet/ })).toBeInTheDocument();

    const netCell = screen.getByRole("button", { name: /Net requirements, Period 3: 210/ });
    await user.click(netCell);
    expect(await screen.findByRole("heading", { name: "Calculation: Net requirements, period 3" })).toBeInTheDocument();
  });
});
