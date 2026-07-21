/** @spec All declarations and algorithms in this file implement: docs/BACKLOG.md §P4 “Ping/ping-back”; GAME_BOOK.md §4/§5; DESIGN_GUIDE.md §15. */
/**
 * Comms — le protocole de la Silence (GB §5, GAME_BIBLE §1) : hails
 * entrants (ping-back = l'événement historique), canaux, chat.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  Antenna,
  CircleDot,
  MessagesSquare,
  Radio,
  Reply,
  Satellite,
  Send,
  Signal,
} from 'lucide-react';
import { api, type ApiError } from '../api.js';
import { t } from '../i18n/en.js';
import '../styles/operations.css';

type Comms = Awaited<ReturnType<typeof api.comms>>;
type Message = Awaited<ReturnType<typeof api.messages>>['messages'][number];

export function CommsScreen() {
  const [comms, setComms] = useState<Comms | null>(null);
  const [channelId, setChannelId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const c = await api.comms();
      setComms(c);
      setChannelId((cur) => cur ?? c.channels[0]?.id ?? null);
    } catch {
      /* la barre d'état du shell couvre l'API down */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const i = setInterval(() => void refresh(), 4_000);
    return () => clearInterval(i);
  }, [refresh]);

  useEffect(() => {
    if (!channelId) return;
    let cancelled = false;
    const load = () =>
      api
        .messages(channelId)
        .then((r) => !cancelled && setMessages(r.messages))
        .catch(() => undefined);
    load();
    const i = setInterval(load, 3_000);
    return () => {
      cancelled = true;
      clearInterval(i);
    };
  }, [channelId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!channelId || !draft.trim()) return;
    try {
      await api.postMessage(channelId, draft);
      setDraft('');
      setMessages((await api.messages(channelId)).messages);
    } catch (err) {
      setNotice((err as ApiError).message ?? t.errors.generic);
    }
  };

  if (!comms) {
    return (
      <div className="operations-page comms-loading">
        <div className="ops-state ops-panel">
          <span className="ops-loader" aria-hidden="true" />
          <p>{t.status.loading}</p>
        </div>
      </div>
    );
  }

  const isEmpty =
    comms.incoming.length === 0 &&
    comms.channels.length === 0 &&
    comms.outgoing.length === 0;
  const selectedChannel = comms.channels.find((channel) => channel.id === channelId);

  return (
    <div className="operations-page comms-screen">
      <aside className="comms-rail" aria-label={t.comms.title}>
        <header className="comms-rail__header">
          <div className="comms-title">
            <span className="ops-icon-well ops-icon-well--accent">
              <Satellite size={21} aria-hidden />
            </span>
            <h2>{t.comms.title}</h2>
          </div>
          <div className="signal-scope signal-scope--small" aria-hidden="true">
            <span className="signal-scope__orbit signal-scope__orbit--one" />
            <span className="signal-scope__orbit signal-scope__orbit--two" />
            <span className="signal-scope__sweep" />
            <span className="signal-scope__contact" />
            <Radio size={16} />
          </div>
        </header>

        {isEmpty && (
          <div className="comms-silence-card">
            <Activity size={17} aria-hidden />
            <p>{t.comms.empty}</p>
          </div>
        )}

        {comms.incoming.length > 0 && (
          <section aria-label={t.comms.incoming} className="comms-rail__section">
            <h3>
              <Signal size={14} aria-hidden />
              {t.comms.incoming}
            </h3>
            <div className="hail-list">
              {comms.incoming.map((p) => (
                <article key={p.id} className="hail-card">
                  <span className="hail-card__beacon" aria-hidden="true">
                    <span />
                    <Antenna size={17} />
                  </span>
                  <div className="hail-card__source">
                    <strong>{p.fromName}</strong>
                    <span>{p.bodyName}</span>
                  </div>
                  <button
                    type="button"
                    className="ops-button ops-button--historic hail-card__action"
                    onClick={async () => {
                      try {
                        const r = await api.pingBack(p.id);
                        setNotice(t.comms.channelOpened);
                        setChannelId(r.channelId);
                        await refresh();
                      } catch (err) {
                        setNotice((err as ApiError).message ?? t.errors.generic);
                      }
                    }}
                  >
                    <Reply size={14} aria-hidden />
                    {t.comms.pingBack}
                  </button>
                </article>
              ))}
            </div>
          </section>
        )}

        {comms.channels.length > 0 && (
          <section aria-label={t.comms.channels} className="comms-rail__section">
            <h3>
              <MessagesSquare size={14} aria-hidden />
              {t.comms.channels}
            </h3>
            <div className="channel-list">
              {comms.channels.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setChannelId(c.id)}
                  aria-pressed={channelId === c.id}
                  className="channel-button"
                  data-active={channelId === c.id || undefined}
                >
                  <span className="channel-button__signal" aria-hidden="true">
                    <CircleDot size={15} />
                  </span>
                  <span>{c.withName}</span>
                  <Signal size={14} aria-hidden />
                </button>
              ))}
            </div>
          </section>
        )}

        {comms.outgoing.length > 0 && (
          <section aria-label={t.comms.outgoing} className="comms-rail__section">
            <h3>
              <Antenna size={14} aria-hidden />
              {t.comms.outgoing}
            </h3>
            <div className="outgoing-list">
              {comms.outgoing.slice(0, 5).map((p) => (
                <span key={p.id} className="outgoing-item">
                  <i aria-hidden="true" />
                  <span>{p.bodyName}</span>
                  <em>{p.status}</em>
                </span>
              ))}
            </div>
          </section>
        )}
      </aside>

      <main className="comms-workspace">
        <header className="conversation-header">
          <div className="conversation-header__identity">
            <span className="ops-section-icon">
              <MessagesSquare size={18} aria-hidden />
            </span>
            <div>
              <span>{t.comms.channels}</span>
              <strong>{selectedChannel?.withName ?? t.comms.noChannel}</strong>
            </div>
          </div>
          <div className="conversation-header__signal" aria-hidden="true">
            <span />
            <span />
            <span />
            <Signal size={16} />
          </div>
        </header>

        <div className="message-stage">
          <div className="message-stage__atmosphere" aria-hidden="true">
            <span className="message-stage__planet" />
            <span className="message-stage__beam" />
          </div>
          {!channelId && (
            <div className="silence-state">
              <div className="signal-scope" aria-hidden="true">
                <span className="signal-scope__orbit signal-scope__orbit--one" />
                <span className="signal-scope__orbit signal-scope__orbit--two" />
                <span className="signal-scope__sweep" />
                <Radio size={27} />
              </div>
              <p>{t.comms.noChannel}</p>
            </div>
          )}
          <div className="message-list">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`message-bubble ${m.mine ? 'message-bubble--mine' : 'message-bubble--theirs'}`}
              >
                {!m.mine && <strong>{m.authorName}</strong>}
                <span>{m.body}</span>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>
        </div>

        {channelId && (
          <form onSubmit={send} className="message-composer">
            <span className="message-composer__antenna" aria-hidden="true">
              <Antenna size={18} />
            </span>
            <input
              aria-label={t.comms.messagePlaceholder}
              placeholder={t.comms.messagePlaceholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              name="message"
              autoComplete="off"
            />
            <button type="submit" className="ops-button message-composer__send">
              <Send size={16} aria-hidden />
              {t.comms.send}
            </button>
          </form>
        )}

        {notice && (
          <p role="status" aria-live="polite" className="ops-notice comms-notice">
            <Radio size={14} aria-hidden />
            <span>{notice}</span>
          </p>
        )}
      </main>
    </div>
  );
}
