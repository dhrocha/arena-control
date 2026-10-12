import { useEffect, useState } from "react";
import type { Sponsor } from "@shared/types/index";
import { SponsorMedia } from "./SponsorMedia";
import "./sponsors-display.css";

interface StripProps {
  left?: string;
  center?: string;
  right?: string;
}

interface Props {
  sponsor: Sponsor | null | undefined;
  topStrip?: StripProps;
  bottomStrip: StripProps;
  /** Extra class for mode-specific styling */
  mode?: "idle" | "halftime" | "manual";
}

function formatNow(): { date: string; time: string } {
  const now = new Date();
  return {
    date: now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }),
    time: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  };
}

export function useLocalClock(tickMs = 1000): { date: string; time: string } {
  const [clock, setClock] = useState(formatNow);
  useEffect(() => {
    const id = setInterval(() => setClock(formatNow()), tickMs);
    return () => clearInterval(id);
  }, [tickMs]);
  return clock;
}

export function HorizontalSponsorLayout({ sponsor, topStrip, bottomStrip, mode = "idle" }: Props) {
  return (
    <div className={`sponsor-h-layout mode-${mode}`}>
      {topStrip && (
        <div className="sponsor-h-strip top">
          {topStrip.left && <span>{topStrip.left}</span>}
          {topStrip.center && <strong>{topStrip.center}</strong>}
          {topStrip.right && <span>{topStrip.right}</span>}
        </div>
      )}
      <div className="sponsor-h-stage">
        <SponsorMedia sponsor={sponsor} />
      </div>
      <div className="sponsor-h-strip bottom">
        {bottomStrip.left && <span>{bottomStrip.left}</span>}
        {bottomStrip.center && <strong>{bottomStrip.center}</strong>}
        {bottomStrip.right && <span>{bottomStrip.right}</span>}
      </div>
    </div>
  );
}
