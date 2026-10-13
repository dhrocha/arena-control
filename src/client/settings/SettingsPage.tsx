import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Settings, SponsorTier } from "@shared/types/index";
import {
  DEFAULT_SPONSOR_TIER_SECONDS,
  SPONSOR_TIER_LABELS,
  SPONSOR_TIER_ORDER,
} from "@shared/sponsors/playlist";
import "./settings.css";

export function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/settings")
      .then((r) => r.json())
      .then(setSettings);
  }, []);

  if (!settings) {
    return <div className="settings-root">Carregando...</div>;
  }

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings({ ...settings, [key]: value });
    setSaved(false);
  };

  return (
    <div className="settings-root">
      <header>
        <div>
          <Link to="/admin">← Admin</Link>
          <h1>Configurações</h1>
        </div>
        <button
          type="button"
          className="btn-primary"
          onClick={async () => {
            await fetch("/api/settings", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(settings),
            });
            setSaved(true);
          }}
        >
          SALVAR
        </button>
      </header>

      {saved && <p className="ok">Configurações salvas.</p>}
      {importMsg && <p className="ok">{importMsg}</p>}

      <section className="panel">
        <h2>Arena</h2>
        <div className="field">
          <label>Nome da arena</label>
          <input value={settings.arenaName} onChange={(e) => update("arenaName", e.target.value)} />
        </div>
        <div className="field">
          <label>PIN do controle</label>
          <input value={settings.pin} onChange={(e) => update("pin", e.target.value)} />
        </div>
        <div className="field">
          <label>Porta</label>
          <input
            type="number"
            value={settings.port}
            onChange={(e) => update("port", Number(e.target.value))}
          />
          <small>Reinicie o servidor após alterar a porta.</small>
        </div>
      </section>

      <section className="panel">
        <h2>Áudio</h2>
        <div className="field">
          <label>Volume geral ({Math.round(settings.volumeMaster * 100)}%)</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volumeMaster}
            onChange={(e) => update("volumeMaster", Number(e.target.value))}
          />
        </div>
        <div className="field">
          <label>Volume efeitos ({Math.round(settings.volumeEffects * 100)}%)</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={settings.volumeEffects}
            onChange={(e) => update("volumeEffects", Number(e.target.value))}
          />
        </div>
      </section>

      <section className="panel">
        <h2>Tempos padrão</h2>
        <div className="grid-2">
          <div className="field">
            <label>Duração partida (min)</label>
            <input
              type="number"
              value={settings.defaultDuration}
              onChange={(e) => update("defaultDuration", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Countdown (s)</label>
            <input
              type="number"
              value={settings.countdownSeconds}
              onChange={(e) => update("countdownSeconds", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>1º tempo (min)</label>
            <input
              type="number"
              value={settings.firstHalfDuration}
              onChange={(e) => update("firstHalfDuration", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>2º tempo (min)</label>
            <input
              type="number"
              value={settings.secondHalfDuration}
              onChange={(e) => update("secondHalfDuration", Number(e.target.value))}
            />
          </div>
          <div className="field">
            <label>Intervalo (min)</label>
            <input
              type="number"
              value={settings.halfTimeDuration}
              onChange={(e) => update("halfTimeDuration", Number(e.target.value))}
            />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>Tempo no carrossel por nível (s)</label>
            <div className="settings-tier-seconds">
              {SPONSOR_TIER_ORDER.map((tier) => (
                <label key={tier} className="settings-tier-field">
                  <span>{SPONSOR_TIER_LABELS[tier]}</span>
                  <input
                    type="number"
                    min={3}
                    value={
                      settings.sponsorTierSeconds?.[tier] ??
                      DEFAULT_SPONSOR_TIER_SECONDS[tier]
                    }
                    onChange={(e) => {
                      const value = Number(e.target.value) || DEFAULT_SPONSOR_TIER_SECONDS[tier];
                      const next = {
                        ...(settings.sponsorTierSeconds ?? DEFAULT_SPONSOR_TIER_SECONDS),
                        [tier]: value,
                      } as Record<SponsorTier, number>;
                      update("sponsorTierSeconds", next);
                    }}
                  />
                </label>
              ))}
            </div>
            <small>
              Usado na tela sem jogos e no botão manual. Ordem: Master → Oficial → Parceiro → Amigo.
            </small>
          </div>
          <div className="field">
            <label>Patrocínio durante o jogo (s)</label>
            <input
              type="number"
              value={settings.halftimeSponsorSeconds ?? 30}
              onChange={(e) => update("halftimeSponsorSeconds", Number(e.target.value))}
            />
            <small>
              Tempo único no intervalo/timeout (todos os níveis). A prioridade continua Master → Amigo.
            </small>
          </div>
          <div className="field">
            <label>Tema</label>
            <select value={settings.theme} onChange={(e) => update("theme", e.target.value)}>
              <option value="dark">Dark</option>
              <option value="arena">Arena</option>
            </select>
          </div>
        </div>
      </section>

      <section className="panel">
        <h2>Backup</h2>
        <div className="backup-actions">
          <a className="btn-primary" href="/api/backup" download>
            EXPORTAR BACKUP
          </a>
          <label className="btn-ghost file-btn">
            IMPORTAR BACKUP
            <input
              type="file"
              accept="application/json,.json"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                const json = JSON.parse(text) as unknown;
                const res = await fetch("/api/backup/import", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(json),
                });
                setImportMsg(res.ok ? "Backup importado." : "Falha ao importar.");
                if (res.ok) {
                  const next = await fetch("/api/settings").then((r) => r.json());
                  setSettings(next);
                }
              }}
            />
          </label>
        </div>
      </section>
    </div>
  );
}
