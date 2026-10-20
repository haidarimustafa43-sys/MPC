import { useEffect, useState } from "react";
import { SeverityBadge } from "../components/common/SeverityBadge";
import { MessageView } from "../components/inbox/MessageView";
import { localize } from "../i18n";
import { useGameStore } from "../state/gameStore";
import { useT } from "../state/selectors";

/** Permanent record of all messages; reading one here marks it as read. */
export function InboxPage() {
  const t = useT();
  const game = useGameStore((state) => state.game);
  const language = useGameStore((state) => state.language);
  const markRead = useGameStore((state) => state.markRead);
  const messages = [...(game?.inboxMessages ?? [])].reverse();
  const [selectedId, setSelectedId] = useState<string | null>(messages[0]?.id ?? null);
  const selected = messages.find((message) => message.id === selectedId);

  useEffect(() => {
    if (selected && selected.status === "UNREAD") markRead(selected.id);
  }, [selected, markRead]);

  return (
    <>
      <h1>{t("inbox.title")}</h1>
      {messages.length === 0 ? (
        <p className="muted">{t("inbox.empty")}</p>
      ) : (
        <div className="inbox">
          <ul className="inbox-list" aria-label={t("inbox.title")}>
            {messages.map((message) => (
              <li key={message.id}>
                <button
                  className={`inbox-item ${message.id === selectedId ? "selected" : ""} ${message.status === "UNREAD" ? "unread" : ""}`}
                  aria-current={message.id === selectedId}
                  onClick={() => setSelectedId(message.id)}
                >
                  <span className="row" style={{ justifyContent: "space-between", width: "100%" }}>
                    <SeverityBadge severity={message.severity} />
                    <span className="muted small">
                      {t("inbox.period")} {message.period}
                    </span>
                  </span>
                  <span className="inbox-title">
                    {message.status === "UNREAD" && <span className="unread-dot" aria-label={t("msgstatus.UNREAD")} />}
                    {localize(message.title, language)}
                  </span>
                  <span className="muted small">
                    {message.sender} · {t(`msgstatus.${message.status}`)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <section className="card">
            {selected ? <MessageView key={selected.id} message={selected} /> : <p className="muted">{t("inbox.select")}</p>}
          </section>
        </div>
      )}
    </>
  );
}
