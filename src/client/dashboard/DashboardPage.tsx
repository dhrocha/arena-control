import { Link } from "react-router-dom";
import { useArenaSocket } from "../../hooks/useArenaSocket";
import { useQrDataUrl } from "../../hooks/useQrDataUrl";
import "./dashboard.css";

export function DashboardPage() {
  const { connected, state } = useArenaSocket({ role: "admin", label: "Dashboard" });
  const network = state?.network;
  const qr = useQrDataUrl(network?.urls.control);
  const devices = state?.devices ?? [];

  return (
    <div className="dash-root">
      <header className="dash-hero">
        <p>LOCAL SERVER</p>
        <h1>{state?.settings.arenaName ?? "Arena Control"}</h1>
        <div className="conn-pill">
          <span className={`conn-dot ${connected ? "on" : ""}`} />
          {connected ? "ONLINE" : "OFFLINE"}
        </div>
      </header>

      <section className="dash-net panel">
        <h2>Rede</h2>
        {(network?.interfaces ?? []).map((iface) => (
          <div key={`${iface.name}-${iface.address}`} className="dash-row">
            <span>{iface.name}</span>
            <code>{iface.address}</code>
          </div>
        ))}
        <div className="dash-row">
          <span>Porta</span>
          <code>{network?.port ?? 3000}</code>
        </div>
      </section>

      <section className="dash-links">
        <Link className="dash-card" to="/admin">
          <strong>Admin</strong>
          <span>Central de Comando</span>
        </Link>
        <Link className="dash-card" to="/control">
          <strong>Control</strong>
          <span>Game Day (celular)</span>
        </Link>
        <Link className="dash-card" to="/pelada">
          <strong>Pelada</strong>
          <span>Controle com PIN</span>
        </Link>
        <Link className="dash-card" to="/arena">
          <strong>Arena</strong>
          <span>TV / projetor</span>
        </Link>
        <Link className="dash-card" to="/setup">
          <strong>Setup</strong>
          <span>Diagnóstico</span>
        </Link>
      </section>

      <section className="dash-connect panel">
        <h2>Conectar celular</h2>
        {qr && <img src={qr} alt="QR" />}
        <code>{network?.urls.control}</code>
      </section>

      <section className="panel">
        <h2>Dispositivos</h2>
        {devices.length === 0 && <p>Nenhum cliente conectado.</p>}
        <ul>
          {devices.map((d) => (
            <li key={d.id}>
              {d.role.toUpperCase()} · {d.label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
