import { useGameStore } from "../../state/gameStore";
import { useT } from "../../state/selectors";
import { Dialog } from "../dialogs/Dialog";
import { MessageView } from "./MessageView";

/**
 * Shows unread critical messages and decision requests one at a time when a
 * week starts. Closing marks the message as read; it stays in the Inbox, where
 * acknowledgement or a decision is still possible.
 */
export function EventPopup() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const markRead = useGameStore((state) => state.markRead);
  const message = game?.inboxMessages.find(
    (candidate) =>
      candidate.status === "UNREAD" && (candidate.severity === "CRITICAL" || candidate.decisionRequired),
  );
  if (!message) return null;
  const close = () => markRead(message.id);
  return (
    <Dialog key={message.id} title={t("inbox.popupTitle")} onClose={close}>
      <MessageView
        message={message}
        onDone={close}
        extraActions={
          <button onClick={close} className="link" style={{ marginLeft: "auto" }}>
            {t("action.later.hint")}
          </button>
        }
      />
      <p className="muted small" style={{ marginTop: "0.75rem" }}>
        {t("inbox.popupNote")}
      </p>
    </Dialog>
  );
}
