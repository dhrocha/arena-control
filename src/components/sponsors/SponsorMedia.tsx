import type { Sponsor } from "@shared/types/index";

interface Props {
  sponsor: Sponsor | null | undefined;
  className?: string;
}

/** Renders sponsor image or muted looping video for arena TV. */
export function SponsorMedia({ sponsor, className }: Props) {
  if (!sponsor?.mediaUrl) {
    return <div className={`sponsor-media empty ${className ?? ""}`}>{sponsor?.name ?? ""}</div>;
  }

  if (sponsor.mediaType === "video") {
    return (
      <video
        className={`sponsor-media ${className ?? ""}`}
        src={sponsor.mediaUrl}
        autoPlay
        muted
        loop
        playsInline
      />
    );
  }

  return <img className={`sponsor-media ${className ?? ""}`} src={sponsor.mediaUrl} alt={sponsor.name} />;
}
