import "./LandingPage.css";

function RefractionDiagram() {
  return (
    <svg className="investigation-art" viewBox="0 0 520 310" role="img" aria-label="Plane wavefronts bend as they pass through a material boundary">
      <defs>
        <pattern id="refraction-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#dce8e5" strokeWidth="1" />
        </pattern>
        <clipPath id="refraction-clip">
          <path d="M260 0H520V310H260Z" />
        </clipPath>
      </defs>
      <rect width="520" height="310" fill="url(#refraction-grid)" />
      <path d="M260 0H520V310H260Z" fill="#dceeea" opacity=".58" />
      <g fill="none" stroke="#247b75" strokeWidth="3" opacity=".9">
        <path d="M42 0L122 310" />
        <path d="M100 0L180 310" />
        <path d="M158 0L238 310" />
      </g>
      <g clipPath="url(#refraction-clip)" fill="none" stroke="#d26b4b" strokeWidth="3" opacity=".95">
        <path d="M255 12L324 0M255 78L414 0M255 144L504 0M255 210L520 24M255 276L520 90M255 342L520 156" />
      </g>
      <path d="M260 0V310" stroke="#213a38" strokeWidth="2" strokeDasharray="7 7" opacity=".65" />
      <circle cx="260" cy="155" r="6" fill="#d26b4b" />
      <text x="24" y="286" fill="#435d58" fontSize="13" fontFamily="sans-serif" letterSpacing="1">MEDIUM 1</text>
      <text x="278" y="286" fill="#435d58" fontSize="13" fontFamily="sans-serif" letterSpacing="1">MEDIUM 2</text>
    </svg>
  );
}

function ReflectionDiagram() {
  return (
    <svg className="investigation-art" viewBox="0 0 520 310" role="img" aria-label="Plane wavefronts approach and reflect from a flat boundary">
      <defs>
        <pattern id="reflection-grid" width="28" height="28" patternUnits="userSpaceOnUse">
          <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#e8e2da" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="520" height="310" fill="url(#reflection-grid)" />
      <path d="M340 0V310" stroke="#213a38" strokeWidth="5" />
      <g fill="none" stroke="#247b75" strokeWidth="3" opacity=".9">
        <path d="M0 24L340 112" />
        <path d="M0 92L340 180" />
        <path d="M0 160L340 248" />
      </g>
      <g fill="none" stroke="#d26b4b" strokeWidth="3" opacity=".95">
        <path d="M340 112L520 66" />
        <path d="M340 180L520 134" />
        <path d="M340 248L520 202" />
      </g>
      <path d="M260 92V180" stroke="#526660" strokeWidth="1.5" strokeDasharray="5 5" />
      <path d="M252 100L260 92L268 100M252 172L260 180L268 172" fill="none" stroke="#526660" strokeWidth="1.5" />
      <circle cx="340" cy="180" r="6" fill="#d26b4b" />
      <text x="24" y="286" fill="#435d58" fontSize="13" fontFamily="sans-serif" letterSpacing="1">INCIDENT WAVE</text>
      <text x="366" y="286" fill="#435d58" fontSize="13" fontFamily="sans-serif" letterSpacing="1">REFLECTED</text>
    </svg>
  );
}

export default function LandingPage({ refractionPath, reflectionPath }) {
  return (
    <main className="landing-page">
      <header className="landing-header">
        <a className="landing-mark" href={import.meta.env.BASE_URL} aria-label="Wave investigations home">
          <span className="mark-symbol" aria-hidden="true"><i /><i /><i /></span>
          <span>WAVE / FIELD NOTES</span>
        </a>
        <a className="landing-home-link" href="https://awm11.github.io/" aria-label="AWM11 home">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
        </a>
      </header>

      <section className="landing-intro" aria-labelledby="landing-title">
        <p className="eyebrow"><span /> WAVE BEHAVIOUR, MADE VISIBLE</p>
        <h1 id="landing-title">Choose an<br />investigation<span className="title-period">.</span></h1>
      </section>

      <section className="investigation-grid" aria-label="Wave investigations">
        <a className="investigation-tile refraction-tile" href={refractionPath}>
          <div className="tile-art"><RefractionDiagram /><span className="tile-number">01</span></div>
          <div className="tile-copy">
            <div><p className="tile-kicker">BOUNDARY STUDY</p><h2>Refraction</h2></div>
            <span className="tile-arrow" aria-hidden="true">↗</span>
            <p className="tile-description">Change a wave’s speed and watch its direction turn.</p>
          </div>
        </a>

        <a className="investigation-tile reflection-tile" href={reflectionPath}>
          <div className="tile-art"><ReflectionDiagram /><span className="tile-number">02</span></div>
          <div className="tile-copy">
            <div><p className="tile-kicker">BOUNDARY STUDY</p><h2>Reflection</h2></div>
            <span className="tile-arrow" aria-hidden="true">↗</span>
            <p className="tile-description">Explore how waves return from a surface.</p>
          </div>
        </a>
      </section>

      <footer className="landing-footer">
        <span>WAVES &amp; MATERIALS</span>
      </footer>
    </main>
  );
}