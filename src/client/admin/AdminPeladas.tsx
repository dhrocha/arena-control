import { useCallback, useEffect, useState } from "react";
import type { ClientCommand } from "@shared/events/index";
import type { PeladaBooking, PeladaSession, Sport } from "@shared/types/index";

type View = "list" | "create" | "detail";

interface Props {
  peladaSession: PeladaSession | null;
  hasActiveMatch: boolean;
  send: (cmd: ClientCommand) => boolean | void;
  onFlash: (msg: string) => void;
}

function formatScheduled(ts: number): string {
  return new Date(ts).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusLabel(status: PeladaBooking["status"]): string {
  switch (status) {
    case "scheduled":
      return "Agendada";
    case "active":
      return "Ativa";
    case "finished":
      return "Finalizada";
    case "cancelled":
      return "Cancelada";
    default:
      return status;
  }
}

function toLocalInputs(ts: number): { date: string; time: string } {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

function fromLocalInputs(date: string, time: string): number {
  return new Date(`${date}T${time}:00`).getTime();
}

export function AdminPeladas({ peladaSession, hasActiveMatch, send, onFlash }: Props) {
  const [view, setView] = useState<View>("list");
  const [bookings, setBookings] = useState<PeladaBooking[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [date, setDate] = useState(() => toLocalInputs(Date.now()).date);
  const [time, setTime] = useState("19:00");
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [sport, setSport] = useState<Sport>("FOOTBALL");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = (await fetch("/api/peladas").then((r) => r.json())) as PeladaBooking[];
      setBookings(rows);
    } catch {
      onFlash("Falha ao carregar peladas");
    } finally {
      setLoading(false);
    }
  }, [onFlash]);

  useEffect(() => {
    void load();
  }, [load, peladaSession?.bookingId, peladaSession?.phase]);

  const selected = bookings.find((b) => b.id === selectedId) ?? null;

  const openDetail = (id: string) => {
    setSelectedId(id);
    setView("detail");
  };

  const resetForm = () => {
    const now = toLocalInputs(Date.now());
    setName("");
    setPhone("");
    setDate(now.date);
    setTime("19:00");
    setDurationMinutes(60);
    setSport("FOOTBALL");
  };

  const createBooking = async () => {
    if (!name.trim() || !phone.trim()) {
      onFlash("Nome e telefone são obrigatórios");
      return;
    }
    const scheduledAt = fromLocalInputs(date, time);
    if (!Number.isFinite(scheduledAt)) {
      onFlash("Data/hora inválida");
      return;
    }
    const res = await fetch("/api/peladas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        phone: phone.trim(),
        scheduledAt,
        durationMinutes,
        sport,
      }),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => null)) as { error?: string } | null;
      onFlash(err?.error ?? "Falha ao criar pelada");
      return;
    }
    const created = (await res.json()) as PeladaBooking;
    resetForm();
    onFlash(`Pelada cadastrada · PIN de acesso: ${created.pin}`);
    await load();
    openDetail(created.id);
  };

  const cancelBooking = async (id: string) => {
    const res = await fetch(`/api/peladas/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "cancelled" }),
    });
    if (!res.ok) {
      onFlash("Falha ao cancelar");
      return;
    }
    await load();
  };

  const deleteBooking = async (id: string) => {
    const res = await fetch(`/api/peladas/${id}`, { method: "DELETE" });
    if (!res.ok) {
      onFlash("Falha ao excluir");
      return;
    }
    setView("list");
    setSelectedId(null);
    await load();
  };

  const startSession = (id: string) => {
    if (hasActiveMatch) {
      onFlash("Finalize a partida Game Day antes de iniciar a pelada");
      return;
    }
    const ok = send({ type: "PELADA_SESSION_START", payload: { bookingId: id } });
    if (ok === false) {
      onFlash("Sem conexão WebSocket");
      return;
    }
    void load();
  };

  const stopSession = () => {
    const ok = send({ type: "PELADA_SESSION_STOP" });
    if (ok === false) {
      onFlash("Sem conexão WebSocket");
      return;
    }
    void load();
  };

  if (view === "create") {
    return (
      <section className="panel">
        <div className="admin-pelada-head">
          <h2>Nova pelada</h2>
          <button type="button" className="btn-ghost" onClick={() => setView("list")}>
            Voltar
          </button>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Quem agendou" />
          </div>
          <div className="field">
            <label>Telefone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(11) 99999-9999" />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Hora</label>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
        </div>
        <div className="grid-2">
          <div className="field">
            <label>Tempo (minutos)</label>
            <input
              type="number"
              min={1}
              value={durationMinutes}
              onChange={(e) => setDurationMinutes(Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Tipo</label>
            <select value={sport} onChange={(e) => setSport(e.target.value as Sport)}>
              <option value="FOOTBALL">Futebol</option>
              <option value="VOLLEYBALL">Vôlei</option>
            </select>
          </div>
        </div>
        <button type="button" className="btn-primary" onClick={() => void createBooking()}>
          Cadastrar
        </button>
      </section>
    );
  }

  if (view === "detail" && selected) {
    const canStart =
      selected.status === "scheduled" && !peladaSession && !hasActiveMatch;
    const isThisActive = peladaSession?.bookingId === selected.id;

    return (
      <section className="panel">
        <div className="admin-pelada-head">
          <h2>{selected.name}</h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              setView("list");
              setSelectedId(null);
            }}
          >
            Voltar
          </button>
        </div>
        <div className="admin-pelada-pin-box">
          <span>PIN de acesso</span>
          <strong>{selected.pin || "—"}</strong>
          <button
            type="button"
            className="btn-ghost"
            disabled={!selected.pin}
            onClick={() => {
              if (!selected.pin) return;
              void navigator.clipboard?.writeText(selected.pin).then(
                () => onFlash("PIN copiado"),
                () => onFlash(`PIN: ${selected.pin}`)
              );
            }}
          >
            Copiar PIN
          </button>
        </div>
        <dl className="admin-pelada-dl">
          <div>
            <dt>Telefone</dt>
            <dd>{selected.phone}</dd>
          </div>
          <div>
            <dt>Horário</dt>
            <dd>{formatScheduled(selected.scheduledAt)}</dd>
          </div>
          <div>
            <dt>Duração</dt>
            <dd>{selected.durationMinutes} min</dd>
          </div>
          <div>
            <dt>Esporte</dt>
            <dd>{selected.sport === "VOLLEYBALL" ? "Vôlei" : "Futebol"}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{statusLabel(selected.status)}</dd>
          </div>
          {isThisActive && peladaSession && (
            <div>
              <dt>Sessão</dt>
              <dd>
                {peladaSession.phase} · termina{" "}
                {new Date(peladaSession.sessionEndsAt).toLocaleTimeString("pt-BR")}
              </dd>
            </div>
          )}
        </dl>
        <div className="admin-pelada-actions">
          {canStart && (
            <button type="button" className="btn-primary" onClick={() => startSession(selected.id)}>
              Iniciar pelada
            </button>
          )}
          {isThisActive && (
            <button type="button" className="btn-danger" onClick={stopSession}>
              Encerrar sessão
            </button>
          )}
          {selected.status === "scheduled" && (
            <button type="button" className="btn-ghost" onClick={() => void cancelBooking(selected.id)}>
              Cancelar agendamento
            </button>
          )}
          {selected.status !== "active" && (
            <button type="button" className="btn-ghost" onClick={() => void deleteBooking(selected.id)}>
              Excluir
            </button>
          )}
        </div>
        <p className="admin-fx-hint">
          Passe o PIN ao grupo. Em <code>/pelada</code> só entra quem tiver este código (não é o PIN do
          controle Game Day).
        </p>
      </section>
    );
  }

  return (
    <section className="panel">
      <div className="admin-pelada-head">
        <h2>Peladas</h2>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            resetForm();
            setView("create");
          }}
        >
          Nova pelada
        </button>
      </div>
      {peladaSession && (
        <div className="admin-pelada-active">
          Sessão ativa · fase <strong>{peladaSession.phase}</strong>
          <button type="button" className="btn-ghost" onClick={stopSession}>
            Encerrar
          </button>
        </div>
      )}
      {loading && <p className="admin-fx-hint">Carregando…</p>}
      {!loading && bookings.length === 0 && <p className="admin-fx-hint">Nenhuma pelada cadastrada.</p>}
      <ul className="admin-pelada-list">
        {bookings.map((b) => (
          <li key={b.id}>
            <button type="button" className="admin-pelada-row" onClick={() => openDetail(b.id)}>
              <div>
                <strong>{b.name}</strong>
                <span>
                  {formatScheduled(b.scheduledAt)} · {b.durationMinutes} min ·{" "}
                  {b.sport === "VOLLEYBALL" ? "Vôlei" : "Futebol"}
                  {b.pin ? ` · PIN ${b.pin}` : ""}
                </span>
              </div>
              <em>{statusLabel(b.status)}</em>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
