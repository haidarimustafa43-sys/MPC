import type { ReactNode } from "react";
import { useState } from "react";
import type { InboxMessage } from "../../domain/gameState";
import { localize } from "../../i18n";
import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";
import { SeverityBadge } from "../common/SeverityBadge";
import { StartWhatIfButton } from "../planning/WhatIfBanner";

interface Props {
  message: InboxMessage;
  headingLevel?: "h2" | "h3";
  onDone?: () => void;
  extraActions?: ReactNode;
}

/**
 * One message with its actions: acknowledge, or one of the event's choices.
 * The text never tells the student how to solve the problem.
 */
export function MessageView({ message, headingLevel = "h2", onDone, extraActions }: Props) {
  const t = useT();
  const language = useGameStore((state) => state.language);
  const scenario = useGameStore((state) => state.scenario);
  const acknowledge = useGameStore((state) => state.acknowledge);
  const respond = useGameStore((state) => state.respond);
  const [reason, setReason] = useState("");
  const event = scenario?.events.find((candidate) => candidate.id === message.eventId);
  const choices = event?.choices ?? [];
  const Heading = headingLevel;
  const answered = message.status === "RESPONDED";
  const chosen = choices.find((choice) => choice.id === message.choiceId);
  const needsAck =
    message.acknowledgementRequired && !message.decisionRequired && message.status !== "ACKNOWLEDGED";

  return (
    <article className="message">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <SeverityBadge severity={message.severity} />
        <span className="badge mode">{t(`msgtype.${message.messageType}`)}</span>
      </div>
      <Heading style={{ marginTop: "0.5rem" }}>{localize(message.title, language)}</Heading>
      <p className="muted small">
        {t("inbox.from")}: <strong>{message.sender}</strong> · {t("inbox.period")} {message.period} ·{" "}
        {t(`msgstatus.${message.status}`)}
      </p>
      <p>{localize(message.body, language)}</p>
      {message.relatedEntityIds && message.relatedEntityIds.length > 0 && (
        <p className="muted small">
          {t("inbox.related")}: {message.relatedEntityIds.join(", ")}
        </p>
      )}

      {message.decisionRequired && !answered && (
        <>
          {message.status === "READ" && message.choiceId === undefined && (
            <p className="muted small">{t("next.openDecisions")}</p>
          )}
          <label className="field" style={{ marginBottom: "0.5rem" }}>
            {t("inbox.reasonLabel")}
            <input
              type="text"
              value={reason}
              maxLength={300}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("plan.reasonPlaceholder")}
            />
          </label>
        </>
      )}
      <div className="row">
        {needsAck && (
          <button
            className="primary"
            onClick={() => {
              acknowledge(message.id);
              onDone?.();
            }}
          >
            {t("action.acknowledge")}
          </button>
        )}
        {message.decisionRequired &&
          !answered &&
          choices.map((choice, index) => (
            <button
              key={choice.id}
              className={index === 0 ? "primary" : ""}
              onClick={() => {
                respond(message.id, choice.id, reason.trim() || undefined);
                onDone?.();
              }}
            >
              {localize(choice.label, language)}
            </button>
          ))}
        {message.decisionRequired && !answered && !extraActions && <StartWhatIfButton label={t("whatIf.exploreRequest")} />}
        {extraActions}
      </div>
      {answered && chosen && (
        <p className="badge ok" style={{ marginTop: "0.5rem" }}>
          {t("inbox.answered", { choice: localize(chosen.label, language) })}
        </p>
      )}
    </article>
  );
}
