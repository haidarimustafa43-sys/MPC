import type { GameState, InboxMessage, MessageStatus } from "../../domain/gameState";
import type { Scenario } from "../../domain/scenario";
import { applyEffects } from "../events/applyEventEffects";
import { GameActionError } from "./errors";
import { recordDecision } from "./gameActions";
import { canPerform } from "./stateMachine";

const findMessage = (game: GameState, messageId: string): InboxMessage => {
  const message = game.inboxMessages.find((candidate) => candidate.id === messageId);
  if (!message) throw new GameActionError("inbox.unknownMessage", { id: messageId });
  return message;
};

const setStatus = (game: GameState, messageId: string, patch: Partial<InboxMessage>): GameState => ({
  ...game,
  inboxMessages: game.inboxMessages.map((message) => (message.id === messageId ? { ...message, ...patch } : message)),
});

/** Leaves EVENTS_PENDING as soon as every new message has been taken in. */
const finishEventsIfDone = (game: GameState): GameState =>
  game.gameStatus === "EVENTS_PENDING" && canPerform(game, "EVENTS_HANDLED").allowed
    ? { ...game, gameStatus: "ANALYSIS" }
    : game;

const rank: Record<MessageStatus, number> = { UNREAD: 0, READ: 1, ACKNOWLEDGED: 2, RESPONDED: 3 };

export const markMessageRead = (game: GameState, messageId: string): GameState => {
  const message = findMessage(game, messageId);
  if (rank[message.status] >= rank.READ) return game;
  return finishEventsIfDone(setStatus(game, messageId, { status: "READ" }));
};

export const acknowledgeMessage = (game: GameState, messageId: string): GameState => {
  const message = findMessage(game, messageId);
  if (message.decisionRequired) throw new GameActionError("inbox.decisionRequired");
  if (rank[message.status] >= rank.ACKNOWLEDGED) return game;
  return finishEventsIfDone(setStatus(game, messageId, { status: "ACKNOWLEDGED" }));
};

/**
 * Answers a message with one of its event's choices. A deferring choice
 * ("review planning before deciding") keeps the message open; any other
 * choice applies its effects and is logged as a decision.
 */
export const respondToMessage = (
  game: GameState,
  scenario: Scenario,
  messageId: string,
  choiceId: string,
  now: string,
  reason?: string,
): GameState => {
  const message = findMessage(game, messageId);
  if (message.status === "RESPONDED") throw new GameActionError("inbox.alreadyAnswered");
  const event = scenario.events.find((candidate) => candidate.id === message.eventId);
  const choice = event?.choices?.find((candidate) => candidate.id === choiceId);
  if (!event || !choice) throw new GameActionError("inbox.unknownChoice", { id: choiceId });

  if (choice.defersDecision) return finishEventsIfDone(setStatus(game, messageId, { status: "READ" }));

  let next = applyEffects(game, choice.effects, game.currentPeriod, event.id);
  next = setStatus(next, messageId, { status: "RESPONDED", choiceId, respondedPeriod: game.currentPeriod });
  next = {
    ...next,
    eventHistory: next.eventHistory.map((entry) =>
      entry.eventId === event.id && entry.choiceId === undefined ? { ...entry, choiceId } : entry,
    ),
  };
  next = recordDecision(
    next,
    {
      timestamp: now,
      category: "MESSAGE_RESPONSE",
      entityType: "MESSAGE",
      entityId: messageId,
      field: "choice",
      newValue: choiceId,
      reason,
    },
    { allowWhileReadingMessages: true },
  );
  return finishEventsIfDone(next);
};

export const unreadCount = (game: GameState): number =>
  game.inboxMessages.filter((message) => message.status === "UNREAD").length;
