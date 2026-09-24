import { Link } from "react-router-dom";
import { useArenaSocket } from "../../hooks/useArenaSocket";
import { useQrDataUrl } from "../../hooks/useQrDataUrl";
import { audioManager } from "../../infrastructure/audio/AudioManager";
import "./setup.css";

export function SetupPage() {
  const { connected, state, send } = useArenaSocket({ role: "admin", label: "Setup" });
  const network = state?.network;
  const qr = useQrDataUrl(network?.urls.control);

  return (
    <div className="setup-root">
      <div className="setup-card">
        <p className="eyebrow">ARENA SERVER</p>
        <h1>Setup</h1>
        <div className="setup-status">
          <span className={`conn-dot ${connected ? "on" : ""}`} />
          {connected ? "RUNNING" : "OFFLINE"}
        </div>

        <div className="setup-grid">
          <div>
            <label>IP LOCAL</label>
            {(network?.interfaces ?? []).map((iface) => (
              <div key={`${iface.name}-${iface.address}`} className="setup-ip">
                <strong>{iface.name}</strong>
                <code>{iface.address}</code>
              </div>
            ))}
          </div>
          <div>
            <label>PORTA</label>
            <code className="big">{network?.port ?? 3000}</code>
          </div>
        </div>

        <div className="setup-links">
          <div>
            <label>CONTROL</label>
            {qr && <img src={qr} alt="QR control" />}
            <code>{network?.urls.control}</code>
          </div>
          <div>
            <label>ARENA</label>
            <code>{network?.urls.arena}</code>
            <Link className="btn-primary" to="/arena" target="_blank">
              Abrir Arena
            </Link>
          </div>
        </div>

        <div className="setup-tests">
          <button
            type="button"
            className="btn-lg"
            onClick={() => {
              audioManager.unlock();
              audioManager.play("/audio/goal.mp3");
            }}
          >
            TESTAR SOM
          </button>
          <button
            type="button"
            className="btn-lg"
            onClick={() => send({ type: "TRIGGER_EFFECT", payload: { effectType: "MATCH_START" } })}
          >
            TESTAR ARENA
          </button>
          <button
            type="button"
            className="btn-lg"
            onClick={async () => {
              const res = await fetch("/api/health");
              alert(res.ok ? "Conexão OK" : "Falha");
            }}
          >
            TESTAR CONEXÃO
          </button>
        </div>

        <div className="setup-nav">
          <Link to="/admin">Central de Comando</Link>
          <Link to="/control">Controle</Link>
          <Link to="/settings">Configurações</Link>
        </div>
      </div>
    </div>
  );
}
