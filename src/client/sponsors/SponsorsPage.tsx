import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { Sponsor, SponsorSlot, SponsorTier } from "@shared/types/index";
import { ALL_SPONSOR_SLOTS } from "@shared/sponsors/playlist";
import "./sponsors.css";

const SLOT_LABELS: Record<SponsorSlot, string> = {
  idle: "Tela sem jogos",
  timeout: "Timeout",
  halftime: "Intervalo",
  mvp: "Craque da Partida",
  manual: "Botão manual",
};

const emptyForm = {
  name: "",
  tier: "standard" as SponsorTier,
  slots: ["idle"] as SponsorSlot[],
  enabled: true,
};

export function SponsorsPage() {
  const [sponsors, setSponsors] = useState<Sponsor[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const list = (await fetch("/api/sponsors").then((r) => r.json())) as Sponsor[];
    setSponsors(list);
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const toggleSlot = (slot: SponsorSlot) => {
    setForm((prev) => {
      const has = prev.slots.includes(slot);
      const slots = has ? prev.slots.filter((s) => s !== slot) : [...prev.slots, slot];
      return { ...prev, slots: slots.length ? slots : (["idle"] as SponsorSlot[]) };
    });
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const startEdit = (s: Sponsor) => {
    setEditingId(s.id);
    setForm({
      name: s.name,
      tier: s.tier,
      slots: [...s.slots],
      enabled: s.enabled,
    });
    setErr(null);
    setMsg(null);
  };

  return (
    <div className="sponsors-root">
      <header>
        <div>
          <Link to="/admin">← Admin</Link>
          <h1>Patrocinadores</h1>
        </div>
      </header>

      {err && <p className="sponsors-err">{err}</p>}
      {msg && <p className="sponsors-ok">{msg}</p>}

      <section className="panel">
        <h2>{editingId ? "Editar patrocinador" : "Novo patrocinador"}</h2>
        <div className="field">
          <label>Nome</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Ex.: Empresa XYZ"
          />
        </div>
        <div className="field">
          <label>Nível</label>
          <select
            value={form.tier}
            onChange={(e) => setForm({ ...form, tier: e.target.value as SponsorTier })}
          >
            <option value="standard">Standard</option>
            <option value="master">Master (aparece mais)</option>
          </select>
        </div>
        <div className="field">
          <label>Onde exibir</label>
          <div className="sponsors-slots">
            {ALL_SPONSOR_SLOTS.map((slot) => (
              <label key={slot} className="sponsors-slot-chip">
                <input
                  type="checkbox"
                  checked={form.slots.includes(slot)}
                  onChange={() => toggleSlot(slot)}
                />
                {SLOT_LABELS[slot]}
              </label>
            ))}
          </div>
          <small>Arte horizontal (16:9) para idle/intervalo; timeout usa o painel direito.</small>
        </div>
        <div className="field">
          <label className="sponsors-slot-chip">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
            />
            Ativo
          </label>
        </div>
        <div className="sponsors-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={async () => {
              setErr(null);
              setMsg(null);
              const name = form.name.trim();
              if (!name) {
                setErr("Informe o nome.");
                return;
              }
              const payload = {
                name,
                tier: form.tier,
                slots: form.slots,
                enabled: form.enabled,
              };
              const res = editingId
                ? await fetch(`/api/sponsors/${editingId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  })
                : await fetch("/api/sponsors", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  });
              const body = (await res.json().catch(() => null)) as { error?: string; id?: string } | null;
              if (!res.ok) {
                setErr(body?.error ?? "Falha ao salvar");
                return;
              }
              setMsg(editingId ? "Patrocinador atualizado." : "Patrocinador criado. Envie a arte abaixo.");
              if (!editingId && body?.id) setEditingId(body.id);
              else resetForm();
              await reload();
            }}
          >
            {editingId ? "Salvar alterações" : "Criar"}
          </button>
          {editingId && (
            <button type="button" className="btn-ghost" onClick={resetForm}>
              Cancelar edição
            </button>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>Cadastrados ({sponsors.length})</h2>
        {sponsors.length === 0 && <p>Nenhum patrocinador ainda.</p>}
        <div className="sponsors-list">
          {sponsors.map((s) => (
            <article key={s.id} className={`sponsors-card ${s.enabled ? "" : "off"}`}>
              <div className="sponsors-card-media">
                {s.mediaUrl ? (
                  s.mediaType === "video" ? (
                    <video src={s.mediaUrl} muted playsInline />
                  ) : (
                    <img src={s.mediaUrl} alt={s.name} />
                  )
                ) : (
                  <div className="sponsors-card-placeholder">Sem mídia</div>
                )}
              </div>
              <div className="sponsors-card-body">
                <strong>{s.name}</strong>
                <span className={`sponsors-tier ${s.tier}`}>{s.tier}</span>
                <div className="sponsors-card-slots">
                  {s.slots.map((slot) => (
                    <em key={slot}>{SLOT_LABELS[slot]}</em>
                  ))}
                </div>
                <label className="file-btn btn-ghost">
                  Enviar arte / vídeo
                  <input
                    type="file"
                    accept="image/*,video/mp4,video/webm,video/quicktime"
                    hidden
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setErr(null);
                      const fd = new FormData();
                      fd.append("media", file);
                      const res = await fetch(`/api/sponsors/${s.id}/media`, {
                        method: "POST",
                        body: fd,
                      });
                      if (!res.ok) {
                        const body = (await res.json().catch(() => null)) as { error?: string } | null;
                        setErr(body?.error ?? "Falha no upload");
                        return;
                      }
                      setMsg(`Mídia de "${s.name}" atualizada.`);
                      await reload();
                    }}
                  />
                </label>
                <div className="sponsors-actions">
                  <button type="button" className="btn-ghost" onClick={() => startEdit(s)}>
                    Editar
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={async () => {
                      await fetch(`/api/sponsors/${s.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ enabled: !s.enabled }),
                      });
                      await reload();
                    }}
                  >
                    {s.enabled ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={async () => {
                      if (!confirm(`Excluir "${s.name}"?`)) return;
                      await fetch(`/api/sponsors/${s.id}`, { method: "DELETE" });
                      if (editingId === s.id) resetForm();
                      await reload();
                    }}
                  >
                    Excluir
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
