import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Effect, EffectType, Sport } from "@shared/types/index";
import "./effects.css";

type SportFilter = "ALL" | Sport;
type EventFilter = "ALL" | EffectType;

const EVENT_OPTIONS: Array<{ value: EventFilter; label: string }> = [
  { value: "ALL", label: "Todos" },
  { value: "GOAL", label: "Gol" },
  { value: "VOLLEY_POINT", label: "Ponto" },
  { value: "VOLLEY_SET_POINT", label: "Set Point" },
  { value: "VOLLEY_DEUCE", label: "Deuce" },
  { value: "VOLLEY_SET_END", label: "Final de Set" },
  { value: "VOLLEY_MATCH_POINT", label: "Match Point" },
  { value: "VOLLEY_MATCH_END", label: "Fim da Partida" },
  { value: "VOLLEY_TIMEOUT", label: "Timeout" },
  { value: "MATCH_START", label: "Início" },
  { value: "MATCH_END", label: "Final" },
  { value: "MVP", label: "Craque da Partida" },
  { value: "MVP_TEASE", label: "Craque (teaser)" },
  { value: "MVP_SPONSOR", label: "Craque (patrocínio)" },
  { value: "COUNTDOWN", label: "Countdown" },
];

function sportLabel(sport: Effect["sport"]): string {
  if (sport === "FOOTBALL") return "Futebol";
  if (sport === "VOLLEYBALL") return "Vôlei";
  return "Todos";
}

export function EffectsPage() {
  const [effects, setEffects] = useState<Effect[]>([]);
  const [editing, setEditing] = useState<Effect | null>(null);
  const [sportFilter, setSportFilter] = useState<SportFilter>("ALL");
  const [eventFilter, setEventFilter] = useState<EventFilter>("ALL");

  const reload = async () => {
    const list = (await fetch("/api/effects").then((r) => r.json())) as Effect[];
    setEffects(list);
  };

  useEffect(() => {
    void reload();
  }, []);

  const filtered = useMemo(() => {
    return effects.filter((fx) => {
      const sportOk =
        sportFilter === "ALL" ||
        fx.sport === "ALL" ||
        fx.sport === sportFilter ||
        (sportFilter === "FOOTBALL" && fx.sport === "FOOTBALL") ||
        (sportFilter === "VOLLEYBALL" && fx.sport === "VOLLEYBALL");
      const eventOk = eventFilter === "ALL" || fx.type === eventFilter;
      return sportOk && eventOk;
    });
  }, [effects, sportFilter, eventFilter]);

  return (
    <div className="effects-root">
      <header>
        <div>
          <Link to="/admin">← Admin</Link>
          <h1>Editor de Efeitos</h1>
        </div>
      </header>

      <div className="effects-filters panel">
        <div className="field">
          <label>Esporte</label>
          <div className="effects-filter-row">
            {(
              [
                ["ALL", "Todos"],
                ["FOOTBALL", "Futebol"],
                ["VOLLEYBALL", "Vôlei"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={sportFilter === value ? "on" : ""}
                onClick={() => setSportFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label>Evento</label>
          <select value={eventFilter} onChange={(e) => setEventFilter(e.target.value as EventFilter)}>
            {EVENT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="effects-layout">
        <section className="panel">
          <ul className="effects-list">
            {filtered.map((fx) => (
              <li key={fx.id}>
                <div>
                  <strong>{fx.name}</strong>
                  <small>
                    {fx.type} · {sportLabel(fx.sport)} · {fx.duration}ms
                  </small>
                </div>
                <div className="fx-actions">
                  <button type="button" onClick={() => setEditing(fx)}>
                    EDITAR
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={async () => {
                      await fetch(`/api/effects/${fx.id}/test`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: "{}",
                      });
                    }}
                  >
                    TESTAR
                  </button>
                </div>
              </li>
            ))}
            {filtered.length === 0 && <li className="effects-empty">Nenhum efeito neste filtro.</li>}
          </ul>
        </section>

        {editing && (
          <section className="panel">
            <h2>{editing.name}</h2>
            <div className="field">
              <label>Esporte</label>
              <select
                value={editing.sport}
                onChange={(e) =>
                  setEditing({ ...editing, sport: e.target.value as Effect["sport"] })
                }
              >
                <option value="ALL">Todos</option>
                <option value="FOOTBALL">Futebol</option>
                <option value="VOLLEYBALL">Vôlei</option>
              </select>
            </div>
            <div className="field">
              <label>Duração (ms)</label>
              <input
                type="number"
                value={editing.duration}
                onChange={(e) => setEditing({ ...editing, duration: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label>Texto</label>
              <input
                value={editing.text ?? ""}
                onChange={(e) => setEditing({ ...editing, text: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Som</label>
              <input
                value={editing.sound ?? ""}
                onChange={(e) => setEditing({ ...editing, sound: e.target.value })}
              />
            </div>
            <label className="check">
              <input
                type="checkbox"
                checked={editing.useTeamColors}
                onChange={(e) => setEditing({ ...editing, useTeamColors: e.target.checked })}
              />
              USAR CORES DO TIME
            </label>
            {!editing.useTeamColors && (
              <div className="grid-2">
                <div className="field">
                  <label>Primária</label>
                  <input
                    type="color"
                    value={editing.primaryColor ?? "#0a0e14"}
                    onChange={(e) => setEditing({ ...editing, primaryColor: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label>Secundária</label>
                  <input
                    type="color"
                    value={editing.secondaryColor ?? "#f5c518"}
                    onChange={(e) => setEditing({ ...editing, secondaryColor: e.target.value })}
                  />
                </div>
              </div>
            )}
            <label className="check">
              <input
                type="checkbox"
                checked={editing.enabled}
                onChange={(e) => setEditing({ ...editing, enabled: e.target.checked })}
              />
              Habilitado
            </label>
            <div className="fx-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  await fetch(`/api/effects/${editing.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(editing),
                  });
                  await reload();
                }}
              >
                SALVAR
              </button>
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                FECHAR
              </button>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
