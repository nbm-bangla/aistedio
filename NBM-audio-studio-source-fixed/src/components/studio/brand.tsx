export function LogoMark({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="42" height="42" rx="12" stroke="currentColor" strokeOpacity=".45" />
      <path d="M10 19v6m5-12v18m5-22v26m5-20v14m5-18v22m5-14v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function StudioBrand({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`studio-brand${compact ? " compact" : ""}`}>
      <span className="brand-symbol"><LogoMark /></span>
      <div className="brand-wordmark"><span>NBM<span className="brand-period">.</span></span><small>AUDIO STUDIO</small></div>
    </div>
  );
}

export function GeminiMark() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 1.5C12 8 8 12 1.5 12 8 12 12 16 12 22.5 12 16 16 12 22.5 12 16 12 12 8 12 1.5Z" fill="url(#gemini-gradient)" /><defs><linearGradient id="gemini-gradient" x1="2" y1="4" x2="22" y2="22"><stop stopColor="#8fa6cd" /><stop offset=".5" stopColor="#b2a0bf" /><stop offset="1" stopColor="#c6a18b" /></linearGradient></defs></svg>;
}

export function HeroWave() {
  return (
    <div className="hero-art" aria-hidden="true">
      <svg viewBox="0 0 420 174" fill="none">
        <defs>
          <linearGradient id="hero-wave" x1="40" y1="80" x2="390" y2="80" gradientUnits="userSpaceOnUse"><stop stopColor="#ac7a57" stopOpacity="0" /><stop offset=".25" stopColor="#c99c77" stopOpacity=".5" /><stop offset=".5" stopColor="#e0b590" /><stop offset=".78" stopColor="#b68866" stopOpacity=".55" /><stop offset="1" stopColor="#ac7a57" stopOpacity="0" /></linearGradient>
          <radialGradient id="hero-glow"><stop stopColor="#a8744f" stopOpacity=".12" /><stop offset="1" stopColor="#a8744f" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse cx="220" cy="77" rx="172" ry="72" fill="url(#hero-glow)" />
        <ellipse cx="221" cy="78" rx="132" ry="63" stroke="#ba9271" strokeOpacity=".1" />
        <ellipse cx="221" cy="78" rx="103" ry="49" stroke="#ba9271" strokeOpacity=".13" />
        <ellipse cx="221" cy="78" rx="70" ry="33" stroke="#ba9271" strokeOpacity=".16" />
        <path d="M25 78H408" stroke="url(#hero-wave)" strokeOpacity=".25" strokeDasharray="2 5" />
        {Array.from({ length: 65 }, (_, i) => {
          const envelope = Math.pow(Math.sin((i / 64) * Math.PI), 2);
          const height = 4 + envelope * (12 + Math.abs(Math.sin(i * 1.37)) * 43 + Math.abs(Math.cos(i * .39)) * 19);
          const fixed = (value: number) => Number(value.toFixed(4));
          return <path key={i} d={`M${fixed(32 + i * 5.8)} ${fixed(78 - height / 2)}v${fixed(height)}`} stroke="url(#hero-wave)" strokeWidth="2.2" strokeLinecap="round" />;
        })}
        <path d="m353 21 2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5 2.5-6Z" stroke="#c29977" strokeOpacity=".6" />
        <circle cx="83" cy="116" r="2.5" stroke="#c29977" strokeOpacity=".45" />
        <path d="M193 135h17m8 0h17" stroke="#b08c6e" strokeOpacity=".5" />
        <circle cx="214" cy="135" r="1.5" fill="#b08c6e" fillOpacity=".65" />
        <text x="214" y="159" textAnchor="middle" fill="#a39889" fillOpacity=".6" fontSize="8.5" letterSpacing="3.7" fontFamily="Manrope, sans-serif">EVERY WORD, A NEW VOICE</text>
      </svg>
    </div>
  );
}
