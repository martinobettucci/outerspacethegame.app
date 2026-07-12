/**
 * Comms — le protocole de la Silence (GB §5, GAME_BIBLE §1) : hails
 * entrants (ping-back = l'événement historique), canaux, chat.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { MessagesSquare, Reply, Satellite } from 'lucide-react';
import { api, type ApiError } from '../api.js';
import { t } from '../i18n/en.js';

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
      <p style={{ padding: 'var(--space-6)', color: 'var(--text-secondary)' }}>
        {t.status.loading}
      </p>
    );
  }

  const isEmpty =
    comms.incoming.length === 0 &&
    comms.channels.length === 0 &&
    comms.outgoing.length === 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '300px 1fr',
        height: '100%',
        minHeight: 0,
      }}
    >
      <aside
        style={{
          borderRight: '1px solid var(--stroke-subtle)',
          padding: 'var(--space-4)',
          overflowY: 'auto',
          display: 'grid',
          gap: 'var(--space-4)',
          alignContent: 'start',
        }}
      >
        <h2 style={{ fontSize: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Satellite size={16} color="var(--accent-400)" aria-hidden /> {t.comms.title}
        </h2>
        {isEmpty && (
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.comms.empty}</p>
        )}
        {comms.incoming.length > 0 && (
          <section aria-label={t.comms.incoming} style={{ display: 'grid', gap: 8 }}>
            <h3 style={{ fontSize: 12, color: 'var(--accent-200)' }}>{t.comms.incoming}</h3>
            {comms.incoming.map((p) => (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg-raised)',
                  border: '1px solid var(--accent-400)',
                  borderRadius: 'var(--radius-card)',
                  padding: 10,
                  display: 'grid',
                  gap: 6,
                }}
              >
                <span style={{ fontSize: 12 }}>
                  <strong>{p.fromName}</strong> — {p.bodyName}
                </span>
                <button
                  type="button"
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
                  style={{
                    display: 'flex',
                    gap: 6,
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'var(--accent-400)',
                    color: '#0D0D0D',
                    border: 'none',
                    borderRadius: 'var(--radius-button)',
                    padding: '6px 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                  }}
                >
                  <Reply size={12} aria-hidden /> {t.comms.pingBack}
                </button>
              </div>
            ))}
          </section>
        )}
        {comms.channels.length > 0 && (
          <section aria-label={t.comms.channels} style={{ display: 'grid', gap: 6 }}>
            <h3 style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.comms.channels}</h3>
            {comms.channels.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setChannelId(c.id)}
                style={{
                  display: 'flex',
                  gap: 8,
                  alignItems: 'center',
                  background: channelId === c.id ? 'var(--primary-600)' : 'var(--bg-raised)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--stroke-subtle)',
                  borderRadius: 'var(--radius-button)',
                  padding: '8px 10px',
                  fontSize: 13,
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <MessagesSquare size={14} aria-hidden /> {c.withName}
              </button>
            ))}
          </section>
        )}
        {comms.outgoing.length > 0 && (
          <section aria-label={t.comms.outgoing} style={{ display: 'grid', gap: 4 }}>
            <h3 style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t.comms.outgoing}</h3>
            {comms.outgoing.slice(0, 5).map((p) => (
              <span key={p.id} style={{ fontSize: 11, color: 'var(--text-disabled)' }}>
                {p.bodyName} — {p.status}
              </span>
            ))}
          </section>
        )}
      </aside>

      <main style={{ display: 'grid', gridTemplateRows: '1fr auto', minHeight: 0 }}>
        <div style={{ overflowY: 'auto', padding: 'var(--space-4)', display: 'grid', gap: 8, alignContent: 'start' }}>
          {!channelId && (
            <p style={{ color: 'var(--text-secondary)', fontSize: 13 }}>{t.comms.noChannel}</p>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                justifySelf: m.mine ? 'end' : 'start',
                maxWidth: '70%',
                background: m.mine ? 'var(--primary-600)' : 'var(--bg-raised)',
                borderRadius: 'var(--radius-card)',
                padding: '8px 12px',
                fontSize: 13,
              }}
            >
              {!m.mine && (
                <strong style={{ fontSize: 11, color: 'var(--accent-200)', display: 'block' }}>
                  {m.authorName}
                </strong>
              )}
              {m.body}
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
        {channelId && (
          <form onSubmit={send} style={{ display: 'flex', gap: 8, padding: 'var(--space-3)' }}>
            <input
              aria-label={t.comms.messagePlaceholder}
              placeholder={t.comms.messagePlaceholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              style={{
                flex: 1,
                background: 'var(--bg-overlay)',
                border: '1px solid var(--stroke-subtle)',
                borderRadius: 'var(--radius-button)',
                color: 'var(--text-primary)',
                padding: '8px 12px',
                fontSize: 13,
              }}
            />
            <button
              type="submit"
              style={{
                background: 'var(--primary-400)',
                color: 'var(--text-primary)',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                padding: '8px 16px',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              {t.comms.send}
            </button>
          </form>
        )}
        {notice && (
          <p role="status" style={{ padding: '0 var(--space-4) var(--space-3)', fontSize: 12, color: 'var(--accent-200)' }}>
            {notice}
          </p>
        )}
      </main>
    </div>
  );
}
