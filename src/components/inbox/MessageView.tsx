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
  const inWhatIf = useGameStore((state) => Boolean(state.game?.whatIf));
  const answeredLive = useGameStore(
    (state) => state.liveGame?.inboxMessages.find((m) => m.id === message.id)?.status === "RESPONDED",
  );
  const [reason, setReason] = useState("");
  const event = scenario?.events.find((candidate) => candidate.id === message.eventId);
  // Deferring a decision means nothing inside a what-if plan: the answer can be undone anyway.
  const choices = (event?.choices ?? []).filter((choice) => !(inWhatIf && choice.defersDecision));
  const Heading = headingLevel;
  const answered = message.status === "RESPONDED";
  const chosen = event?.choices?.find((choice) => choice.id === message.choiceId);
  const openDecision = message.decisionRequired && !answered;
  // In the live game the what-if is offered first: answers there are final.
  const offerWhatIf = openDecision && !inWhatIf && !extraActions;
  const answeredInWhatIf = answered && inWhatIf && !answeredLive;
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

      {openDecision && (
        <>
          {message.status === "READ" && message.choiceId === undefined && (
            <p className="muted small">{t("next.openDecisions")}</p>
          )}
          {inWhatIf ? (
            <p className="whatif-note small" role="note">
              <span className="badge whatif">{t("mode.whatIf")}</span> {t("whatIf.answerHere")}
            </p>
          ) : (
            <p className="small">{t(offerWhatIf ? "whatIf.answerFinal" : "whatIf.answerFinalLater")}</p>
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
        {offerWhatIf && <StartWhatIfButton label={t("whatIf.exploreRequest")} primary />}
        {openDecision &&
          choices.map((choice, index) => (
            <button
              key={choice.id}
              className={index === 0 && inWhatIf ? "primary" : ""}
              onClick={() => {
                respond(message.id, choice.id, reason.trim() || undefined);
                onDone?.();
              }}
            >
              {localize(choice.label, language)}
            </button>
          ))}
        {extraActions}
      </div>
      {answeredInWhatIf && chosen && (
        <p className="whatif-note small" role="status" style={{ marginTop: "0.5rem" }}>
          <span className="badge whatif">{t("mode.whatIf")}</span>{" "}
          {t("whatIf.answeredHere", { choice: localize(chosen.label, language) })}
        </p>
      )}
      {answered && !answeredInWhatIf && chosen && (
        <p className="badge ok" style={{ marginTop: "0.5rem" }}>
          {t("inbox.answered", { choice: localize(chosen.label, language) })}
        </p>
      )}
    </article>
  );
}
