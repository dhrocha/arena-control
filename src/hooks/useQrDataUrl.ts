import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function useQrDataUrl(text: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!text) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(text, {
      margin: 1,
      width: 220,
      color: { dark: "#0a0e14", light: "#ffffff" },
    })
      .then((data) => {
        if (!cancelled) setUrl(data);
      })
      .catch(() => {
        if (!cancelled) setUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  return url;
}
