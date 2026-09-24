import os from "node:os";
import type { NetworkInfo } from "../../shared/types/index.ts";

export function listLocalIPs(): Array<{ name: string; address: string; family: string }> {
  const nets = os.networkInterfaces();
  const result: Array<{ name: string; address: string; family: string }> = [];

  for (const [name, entries] of Object.entries(nets)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.internal) continue;
      const family = typeof entry.family === "string" ? entry.family : `IPv${entry.family}`;
      if (family !== "IPv4") continue;
      result.push({ name, address: entry.address, family });
    }
  }

  if (result.length === 0) {
    result.push({ name: "loopback", address: "127.0.0.1", family: "IPv4" });
  }

  return result;
}

export function buildNetworkInfo(port: number): NetworkInfo {
  const interfaces = listLocalIPs();
  const primary = interfaces[0]?.address ?? "127.0.0.1";
  const base = `http://${primary}:${port}`;

  return {
    port,
    interfaces,
    urls: {
      root: base,
      admin: `${base}/admin`,
      control: `${base}/control`,
      arena: `${base}/arena`,
      setup: `${base}/setup`,
    },
  };
}
