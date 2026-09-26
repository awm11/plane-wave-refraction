import { useEffect, useMemo, useState } from "react";
import BuyMeCoffeeButton from "./BuyMeCoffeeButton.jsx";

const W = 1200;
const H = 720;
const INITIAL_ANGLE_DEG = 30;
const INITIAL_WAVELENGTH = 80;
const INITIAL_SPEED = 130;
const INITIAL_BEAM_WIDTH = 170;
const WALL_X = 850;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rad = (deg) => (deg * Math.PI) / 180;
const fmt = (value, digits = 1) => Number(value).toFixed(digits);
const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const mul = (a, s) => ({ x: a.x * s, y: a.y * s });
const dot = (a, b) => a.x * b.x + a.y * b.y;
const len = (a) => Math.hypot(a.x, a.y);
const unit = (a) => mul(a, 1 / (len(a) || 1));

function angleWedgePath(center, rayA, rayB, radius) {
  const a = Math.atan2(rayA.y, rayA.x);
  const b = Math.atan2(rayB.y, rayB.x);
  let delta = b - a;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  const start = add(
    center,
    mul({ x: Math.cos(a), y: Math.sin(a) }, radius)
  );
  const end = add(
    center,
    mul(
      { x: Math.cos(a + delta), y: Math.sin(a + delta) },
      radius
    )
  );
  const largeArc = Math.abs(delta) > Math.PI ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;

  return `M ${center.x} ${center.y} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${end.x} ${end.y} Z`;
}

function separateLabelPositions(first, second) {
  const labelsOverlap =
    Math.abs(first.x - second.x) < 100 &&
    Math.abs(first.y - second.y) < 30;

  if (!labelsOverlap) {
    return second;
  }

  return {
    x: second.x,
    y: first.y + (second.y >= first.y ? 42 : -42),
  };
}

function linePolygonSegment(origin, direction, polygon) {
  const hits = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    const edge = { x: b.x - a.x, y: b.y - a.y };

    const denom =
      direction.x * edge.y -
      direction.y * edge.x;

    if (Math.abs(denom) < 1e-9) continue;

    const rel = {
      x: a.x - origin.x,
      y: a.y - origin.y,
    };

    const t =
      (rel.x * edge.y - rel.y * edge.x) /
      denom;

    const u =
      (rel.x * direction.y - rel.y * direction.x) /
      denom;

    if (u >= -1e-9 && u <= 1 + 1e-9) {
      hits.push(add(origin, mul(direction, t)));
    }
  }

  if (hits.length < 2) return null;

  hits.sort(
    (a, b) =>
      dot(a, direction) -
      dot(b, direction)
  );

  return [hits[0], hits[hits.length - 1]];
}

/*
 * Clip a line segment to the visible SVG viewport.
 *
 * At steep angles the finite beam geometry can extend far beyond
 * the SVG's 0..W / 0..H viewport. The wavefront itself still exists,
 * but only the portion inside the simulation pane should be drawn.
 */
function clipSegmentToRect(segment, xMin, yMin, xMax, yMax) {
  if (!segment) return null;

  let [a, b] = segment;

  const dx = b.x - a.x;
  const dy = b.y - a.y;

  let t0 = 0;
  let t1 = 1;

  const clip = (p, q) => {
    if (Math.abs(p) < 1e-12) {
      return q >= 0;
    }

    const r = q / p;

    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }

    return true;
  };

  if (!clip(-dx, a.x - xMin)) return null;
  if (!clip(dx, xMax - a.x)) return null;
  if (!clip(-dy, a.y - yMin)) return null;
  if (!clip(dy, yMax - a.y)) return null;

  if (t0 > t1) return null;

  a = {
    x: a.x + dx * t0,
    y: a.y + dy * t0,
  };

  b = {
    x: a.x + dx * (t1 - t0),
    y: a.y + dy * (t1 - t0),
  };

  return [a, b];
}

function finiteWavefronts({
  direction,
  wavelength,
  phase,
  polygon,
  originPhase = 0,
  maxLines = 32,
}) {
  const d0 = Math.min(
    ...polygon.map((p) => dot(p, direction))
  );

  const d1 = Math.max(
    ...polygon.map((p) => dot(p, direction))
  );

  const first =
    Math.floor(
      (d0 - phase + originPhase) /
        wavelength
    ) - 2;

  const last =
    Math.ceil(
      (d1 - phase + originPhase) /
        wavelength
    ) + 2;

  const lines = [];

  /*
   * Generate against the full beam polygon, then clip each
   * wavefront to the actual visible simulation pane.
   *
   * This is important at high incidence angles: the beam polygon
   * can become much taller than the SVG viewport, so wavefronts
   * near the wall must not be discarded simply because the rest
   * of their mathematical segment lies outside the pane.
   */
  for (
    let i = first;
    i <= last && lines.length < maxLines;
    i += 1
  ) {
    const distance =
      phase -
      originPhase +
      i * wavelength;

    const origin = mul(
      direction,
      distance
    );

    const seg = linePolygonSegment(
      origin,
      {
        x: -direction.y,
        y: direction.x,
      },
      polygon
    );

    const visibleSeg = clipSegmentToRect(
      seg,
      0,
      0,
      W,
      H
    );

    if (visibleSeg) {
      lines.push(visibleSeg);
    }
  }

  return lines;
}

function Arrow({
  x1,
  y1,
  x2,
  y2,
  stroke = "#245766",
  className = "rayArrow",
}) {
  return (
    <line
      className={className}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={stroke}
      strokeWidth="3.5"
      markerEnd="url(#arrow)"
    />
  );
}

function App() {
  const [angleDeg, setAngleDeg] = useState(
    INITIAL_ANGLE_DEG
  );
  const [wavelength, setWavelength] = useState(
    INITIAL_WAVELENGTH
  );
  const [speed, setSpeed] = useState(
    INITIAL_SPEED
  );
  const [beamWidth, setBeamWidth] = useState(
    INITIAL_BEAM_WIDTH
  );
  const [phase, setPhase] = useState(0);
  const [paused, setPaused] = useState(false);
  const [showRays, setShowRays] = useState(true);
  const [showAngles, setShowAngles] = useState(true);
  const [showWavefronts, setShowWavefronts] = useState(true);
  const [showLegend, setShowLegend] = useState(true);
  const [maximized, setMaximized] = useState(false);

  const geometry = useMemo(() => {
    const theta = rad(angleDeg);

    // The barrier is vertical, so reflection flips the x-component
    // and keeps y.
    const incident = {
      x: Math.cos(theta),
      y: -Math.sin(theta),
    };

    const reflected = {
      x: -Math.cos(theta),
      y: -Math.sin(theta),
    };

    const tangentIncident = {
      x: -incident.y,
      y: incident.x,
    };

    const tangentReflected = {
      x: -reflected.y,
      y: reflected.x,
    };

    const hit = {
      x: WALL_X,
      y: 388,
    };

    const beamHalf = beamWidth / 2;
    const leftX = 44;

    const offsetLinePointAtX = (
      center,
      direction,
      tangent,
      offset,
      x
    ) => {
      const point = add(
        center,
        mul(tangent, offset)
      );

      const t =
        (x - point.x) /
        direction.x;

      return add(
        point,
        mul(direction, t)
      );
    };

    // The aperture is a real finite-width strip: its two edges
    // are parallel to the central ray, and their intersections
    // with the mirror define the finite patch that illuminates
    // the barrier.
    const incidentTop =
      offsetLinePointAtX(
        hit,
        incident,
        tangentIncident,
        -beamHalf,
        leftX
      );

    const incidentBottom =
      offsetLinePointAtX(
        hit,
        incident,
        tangentIncident,
        beamHalf,
        leftX
      );

    const hitTop =
      offsetLinePointAtX(
        hit,
        incident,
        tangentIncident,
        -beamHalf,
        WALL_X
      );

    const hitBottom =
      offsetLinePointAtX(
        hit,
        incident,
        tangentIncident,
        beamHalf,
        WALL_X
      );

    const reflectedTop =
      offsetLinePointAtX(
        hitTop,
        reflected,
        tangentReflected,
        0,
        leftX
      );

    const reflectedBottom =
      offsetLinePointAtX(
        hitBottom,
        reflected,
        tangentReflected,
        0,
        leftX
      );

    const incidentPolygon = [
      incidentTop,
      hitTop,
      hitBottom,
      incidentBottom,
    ];

    const reflectedPolygon = [
      hitTop,
      reflectedTop,
      reflectedBottom,
      hitBottom,
    ];

    const normal = {
      x: -1,
      y: 0,
    };

    const normalLine = [
      hit,
      add(hit, mul(normal, 150)),
    ];

    // Phase continuity at the wall: the incident and reflected
    // phase fields match along x = WALL_X.
    const reflectionPhaseOffset =
      2 * Math.cos(theta) * WALL_X;

    return {
      theta,
      incident,
      reflected,
      normal,
      hit,
      incidentPolygon,
      reflectedPolygon,
      hitTop,
      hitBottom,
      incidentTop,
      incidentBottom,
      reflectedTop,
      reflectedBottom,
      incidentRay: clipSegmentToRect(
        [
          add(hit, mul(incident, -2000)),
          hit,
        ],
        0,
        0,
        WALL_X,
        H
      ),
      reflectedRay: clipSegmentToRect(
        [
          hit,
          add(hit, mul(reflected, 2000)),
        ],
        0,
        0,
        WALL_X,
        H
      ),
      tangentIncident,
      tangentReflected,
      normalLine,
      reflectionPhaseOffset,
      incidenceText: `θᵢ = ${fmt(
        angleDeg,
        1
      )}°`,
      reflectionText: `θᵣ = ${fmt(
        angleDeg,
        1
      )}°`,
    };
  }, [angleDeg, beamWidth]);

  useEffect(() => {
    let frame;
    let previous = performance.now();

    const tick = (now) => {
      const dt = Math.min(
        0.05,
        (now - previous) / 1000
      );

      previous = now;

      if (!paused) {
        setPhase(
          (p) => p + speed * dt
        );
      }

      frame =
        requestAnimationFrame(tick);
    };

    frame =
      requestAnimationFrame(tick);

    return () =>
      cancelAnimationFrame(frame);
  }, [paused, speed]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === "Escape") {
        if (maximized) {
          setMaximized(false);
        }
        return;
      }

      const target = event.target;

      if (
        target instanceof Element &&
        target.closest(
          'button, input, textarea, select, [contenteditable="true"]'
        )
      ) {
        return;
      }

      if (
        event.code === "Comma" ||
        event.code === "Period"
      ) {
        event.preventDefault();

        const delta =
          event.code === "Comma"
            ? -1
            : 1;

        setAngleDeg((value) =>
          clamp(
            value + delta,
            0,
            65
          )
        );
      }

      if (
        event.code === "Space" &&
        !event.repeat
      ) {
        event.preventDefault();

        setPaused((value) => !value);
      }
    };

    window.addEventListener(
      "keydown",
      onKeyDown
    );

    return () =>
      window.removeEventListener(
        "keydown",
        onKeyDown
      );
  }, [maximized]);

  const incidentRows =
    finiteWavefronts({
      direction: geometry.incident,
      wavelength,
      phase,
      polygon:
        geometry.incidentPolygon,
      maxLines: 24,
    });

  const reflectedRows =
    finiteWavefronts({
      direction: geometry.reflected,
      wavelength,
      phase,
      originPhase:
        geometry.reflectionPhaseOffset,
      polygon:
        geometry.reflectedPolygon,
      maxLines: 18,
    });

  const labelAngleDeg =
    Math.abs(angleDeg) < 25
      ? (angleDeg < 0 ? -25 : 25)
      : angleDeg;
  const labelAngle = rad(labelAngleDeg);
  const labelIncident = {
    x: Math.cos(labelAngle),
    y: -Math.sin(labelAngle),
  };
  const labelReflected = {
    x: -Math.cos(labelAngle),
    y: -Math.sin(labelAngle),
  };

  const incidentBeamLabelPosition =
    add(
      geometry.hit,
      add(
        mul(
          geometry.incident,
          -180
        ),
        mul(
          unit({
            x: -geometry.incident.y,
            y: geometry.incident.x,
          }),
          16
        )
      )
    );

  const reflectedBeamLabelPosition =
    add(
      geometry.hit,
      add(
        mul(
          geometry.reflected,
          180
        ),
        mul(
          unit({
            x: -geometry.reflected.y,
            y: geometry.reflected.x,
          }),
          16
        )
      )
    );

  const incidenceLabelPosition =
    add(
      geometry.hit,
      add(
        mul(
          unit(
            add(
              geometry.normal,
              mul(labelIncident, -1)
            )
          ),
          185
        ),
        { x: -18, y: 0 }
      ),
    );

  const reflectionLabelPosition =
    separateLabelPositions(
      incidenceLabelPosition,
      add(
        geometry.hit,
        add(
          mul(
            unit(
              add(
                geometry.normal,
                labelReflected
              )
            ),
            185
          ),
          { x: -18, y: 0 }
        )
      )
    );

  const reset = () => {
    setAngleDeg(
      INITIAL_ANGLE_DEG
    );
    setWavelength(
      INITIAL_WAVELENGTH
    );
    setSpeed(INITIAL_SPEED);
    setBeamWidth(
      INITIAL_BEAM_WIDTH
    );
    setPhase(0);
    setPaused(false);
    setShowRays(true);
    setShowAngles(true);
    setShowWavefronts(true);
  };

  const control = (
    label,
    value,
    min,
    max,
    step,
    onChange,
    display
  ) => (
    <div className="control">
      <div className="controlHead">
        <label>{label}</label>
        <output>{display}</output>
      </div>

      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) =>
          onChange(
            Number(e.target.value)
          )
        }
      />
    </div>
  );

  return (
    <div className="app">
      <style>{`
        :root {
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          color: #193b45;
        }

        * {
          box-sizing: border-box;
        }

        html,
        body,
        #root {
          margin: 0;
          min-width: 320px;
          min-height: 100%;
        }

        body {
          min-height: 100vh;
          background: linear-gradient(135deg, #eef7f8, #dce9ed);
          overflow-x: hidden;
        }

        button,
        input {
          font: inherit;
        }

        button {
          -webkit-tap-highlight-color: transparent;
        }

        .app {
          width: 100%;
          max-width: 1480px;
          min-height: 100vh;
          margin: 0 auto;
          padding: 14px 16px 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .top {
          display: flex;
          justify-content: center;
          align-items: center;
          position: relative;
        }

        .topIdentity {
          display: flex;
          align-items: center;
          gap: 14px;
          justify-content: center;
          width: 100%;
          padding: 0 56px;
          text-align: center;
        }

        .titleBlock h1 {
          padding: 8px 14px;
          color: #666;
        }

        .brandDot {
          position: absolute;
          left: 0;
          top: 50%;
          width: 46px;
          height: 46px;
          border-radius: 11px;
          border: 1px solid rgba(38,72,81,.12);
          background: rgba(255,255,255,.82);
          display: grid;
          place-items: center;
          color: #245766;
          box-shadow: 0 8px 20px rgba(47,76,85,.08);
          transform: translateY(-50%);
          flex: 0 0 auto;
        }

        .brandDot svg {
          width: 24px;
          height: 24px;
        }

        .homeLink {
          display: inline-flex;
          position: absolute;
          right: 0;
          top: 50%;
          width: 46px;
          height: 46px;
          border-radius: 11px;
          transform: translateY(-50%);
        }

        .homeLink img {
          display: block;
          width: 100%;
          height: 100%;
        }

        .homeLink:focus-visible {
          outline: 3px solid #2f7883;
          outline-offset: 3px;
        }

        h1 {
          margin: 0;
          font-size: clamp(24px, 2.6vw, 34px);
          letter-spacing: -.04em;
        }

        .sub {
          margin: 5px auto 0;
          max-width: 780px;
          color: #607980;
          font-size: 13px;
          line-height: 1.4;
        }

        .badge {
          padding: 7px 11px;
          border: 1px solid rgba(38,72,81,.11);
          border-radius: 999px;
          background: rgba(255,255,255,.78);
          color: #55717a;
          font-size: 10px;
          font-weight: 750;
          white-space: nowrap;
        }

        .layout {
          flex: 1;
          min-width: 0;
          min-height: 0;
          display: grid;
          grid-template-columns: 278px minmax(0,1fr);
          gap: 12px;
          align-items: stretch;
        }

        .hotkeys {
          order: 4;
          grid-column: 1 / -1;
          position: relative;
          display: flex;
          justify-content: center;
          align-items: center;
          flex-wrap: wrap;
          gap: 8px 18px;
          padding: 8px 174px 8px 12px;
          color: #607980;
          font-size: 12px;
        }

        .hotkeys > .coffee-embed-frame {
          position: absolute;
          top: 50%;
          right: 12px;
          transform: translateY(-50%);
        }

        .hotkeys span {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          white-space: nowrap;
        }

        .hotkeys kbd {
          min-width: 22px;
          padding: 3px 6px;
          border: 1px solid rgba(38,72,81,.2);
          border-bottom-width: 2px;
          border-radius: 5px;
          background: rgba(255,255,255,.78);
          color: #245766;
          font: 700 11px/1.1 inherit;
          text-align: center;
        }

        .card {
          min-width: 0;
          background: rgba(255,255,255,.8);
          border: 1px solid rgba(38,72,81,.11);
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 15px 40px rgba(47,76,85,.11);
        }

        .stage {
          position: relative;
          min-height: 0;
          height: 520px;
          background: #dcecef;
        }

        .sim {
          width: 100%;
          height: 100%;
          min-height: 0;
          display: block;
          touch-action: none;
          user-select: none;
        }

        .controls {
          height: 520px;
          padding: 14px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          overflow-y: auto;
          overflow-x: hidden;
        }

        .wavePanel {
          overflow: hidden;
        }

        .section {
          margin-top: 1px;
          color: #648089;
          text-transform: uppercase;
          letter-spacing: .08em;
          font-size: 10px;
          font-weight: 850;
        }

        .control {
          border-top: 1px solid rgba(49,79,88,.1);
          padding-top: 9px;
        }

        .sliderGrid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .controlHead {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 7px;
          margin-bottom: 5px;
        }

        .controlHead label {
          font-size: 10px;
          line-height: 1.25;
          font-weight: 680;
        }

        output {
          flex-shrink: 0;
          padding: 4px 6px;
          border-radius: 7px;
          background: #edf6f7;
          color: #295a67;
          font-size: 8px;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
        }

        input[type=range] {
          width: 100%;
          height: 14.4px;
          margin: 0;
          accent-color: #2f7384;
        }

        .pauseButton {
          width: 100%;
          padding: 8.1px 10px;
          border: 1px solid #2a6168;
          border-radius: 9px;
          background: #edf6f7;
          color: #245766;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
        }

        .actionGrid {
          display:grid;
          grid-template-columns:repeat(2, minmax(0, 1fr));
          gap:10px;
        }

        .pauseButton:hover {
          background: #e3f1f3;
        }

        .resetButton {
          width: 100%;
          padding: 7.2px 10px;
          border: 1px solid rgba(49,79,88,.16);
          border-radius: 9px;
          background: rgba(255,255,255,.65);
          color: #4b6972;
          font-size: 10px;
          font-weight: 760;
          cursor: pointer;
        }

        .resetButton:hover {
          background: #f2f7f8;
        }

        .toggleRow {
          display:flex;
          flex-direction:column;
          align-items:center;
          justify-content:flex-start;
          gap:3px;
          min-width:0;
          padding:0 1px;
          color:#35545c;
          font-size:8px;
          font-weight:750;
          line-height:10px;
          white-space:nowrap;
        }

        .toggleGrid {
          display:grid;
          grid-template-columns:repeat(3, minmax(0, 1fr));
          gap:6px;
        }

        .toggle {
          position:relative;
          flex:0 0 auto;
          width:34px;
          height:18px;
          padding:2px;
          border:1px solid #8a9ca0;
          border-radius:999px;
          background:#e2e9ea;
          cursor:pointer;
          transition:background 160ms ease,border-color 160ms ease;
        }

        .toggle.isOn {
          border-color:#246f70;
          background:#2d8581;
        }

        .toggle:focus-visible {
          outline:2px solid #245766;
          outline-offset:2px;
        }

        .toggleThumb {
          display:block;
          width:12px;
          height:12px;
          border-radius:50%;
          background:#fff;
          box-shadow:0 1px 3px rgba(18,48,54,.28);
          transform:translateX(0);
          transition:transform 160ms ease;
        }

        .toggle.isOn .toggleThumb {
          transform:translateX(14px);
        }

        .metrics {
          display:grid;
          grid-template-columns:1fr 1fr;
          gap:6px;
        }

        .metric {
          min-width:0;
          padding:7px;
          border-radius:9px;
          background:#f3f8f9;
          border:1px solid rgba(49,79,88,.07);
        }

        .metric span {
          display:block;
          color:#74888e;
          font-size:8px;
          line-height:1.2;
          margin-bottom:2px;
        }

        .metric strong {
          display:block;
          font-size:10px;
          line-height:1.2;
          font-variant-numeric:tabular-nums;
        }

        .metric small {
          display:block;
          margin-top:2px;
          color:#7b8d92;
          font-size:8px;
          line-height:1.2;
          font-weight:650;
        }

        .legend {
          display:flex;
          flex-direction:column;
          gap:8px;
          color:#657b82;
          font-size:10px;
        }

        .legendRow {
          display:flex;
          align-items:center;
          gap:7px;
        }

        .legendSwatch {
          flex:0 0 auto;
          width:22px;
          height:4px;
          border-radius:999px;
          background:#245766;
        }

        .legendWall {
          flex:0 0 auto;
          width:22px;
          height:14px;
          border-radius:4px;
          background:repeating-linear-gradient(135deg,#a2b4b8 0 2px,#d7e1e3 2px 5px);
          border:1px solid #7f9296;
        }

        .legendNormal {
          width:22px;
          border-top:2px dashed #7e9197;
        }

        .legendWindow {
          position:absolute;
          top:54px;
          right:12px;
          z-index:4;
          width:min(250px, calc(100% - 24px));
          padding:12px;
          border:1px solid rgba(38,72,81,.18);
          border-radius:8px;
          background:rgba(255,255,255,.96);
          box-shadow:0 10px 28px rgba(47,76,85,.2);
        }

        .legendHeader {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:12px;
          margin-bottom:10px;
          color:#193b45;
          font-size:12px;
          font-weight:800;
        }

        .legendClose {
          display:grid;
          place-items:center;
          width:26px;
          height:26px;
          padding:0;
          border:1px solid rgba(49,79,88,.18);
          border-radius:6px;
          background:#fff;
          color:#245766;
          cursor:pointer;
        }

        .legendClose svg {
          width:15px;
          height:15px;
          fill:none;
          stroke:currentColor;
          stroke-width:1.8;
          stroke-linecap:round;
        }

        .formula {
          margin-top:4px;
          padding:16px 16px 4px;
          background:#f5f8f8;
          border:1px solid #d8e2e3;
          border-radius:10px;
        }

        .formula h3 {
          margin:0 0 14px;
          font-size:15px;
          font-weight:600;
          color:#263b40;
        }

        .formula .row {
          display:flex;
          flex-direction:column;
          gap:5px;
          margin-bottom:12px;
        }

        .formula .label {
          font-size:12px;
          font-weight:600;
          color:#52656b;
        }

        .equation {
          font-family:Georgia,serif;
          font-size:15px;
          color:#263b40;
        }

        .equation.big {
          font-size:18px;
          font-weight:600;
          color:#245b63;
        }

        .stageToolbar {
          position:absolute;
          top:12px;
          left:12px;
          right:12px;
          z-index:3;
          display:flex;
          justify-content:space-between;
          align-items:center;
          pointer-events:none;
        }

        .toolGroup {
          display:flex;
          gap:6px;
          pointer-events:auto;
        }

        .iconButton {
          display:grid;
          place-items:center;
          width:32px;
          height:32px;
          padding:0;
          border:1px solid rgba(49,79,88,.18);
          border-radius:8px;
          background:#fff;
          color:#245766;
          cursor:pointer;
        }

        .iconButton:hover {
          background:#edf6f7;
        }

        .iconButton:focus-visible {
          outline:2px solid #245766;
          outline-offset:2px;
        }

        .iconButton svg {
          width:17px;
          height:17px;
          fill:none;
          stroke:currentColor;
          stroke-width:1.8;
          stroke-linecap:round;
          stroke-linejoin:round;
        }

        .pill {
          display:inline-flex;
          align-items:center;
          gap:7px;
          padding:8px 10px;
          border-radius:999px;
          background:rgba(255,255,255,.87);
          border:1px solid rgba(49,79,88,.12);
          color:#496770;
          font-size:10px;
          font-weight:760;
          box-shadow:0 6px 18px rgba(47,76,85,.08);
          pointer-events:auto;
        }

        .dot {
          width:7px;
          height:7px;
          border-radius:50%;
          background:#2d8581;
        }

        .layout.isMax {
          position:fixed;
          inset:0;
          z-index:1000;
          display:block;
          padding:16px;
          background:linear-gradient(135deg,#eef7f8,#dce9ed);
        }

        .layout.isMax > :not(.stage) {
          display:none;
        }

        .layout.isMax .stage {
          width:100%;
          height:100%;
          max-height:none;
          border-radius:12px;
        }

        @media (max-width:1180px) {
          .app {
            max-width:1220px;
            padding-left:12px;
            padding-right:12px;
          }

          .layout {
            grid-template-columns:220px minmax(0,1fr);
            gap:10px;
          }

          .controls {
            padding:12px;
          }
        }

        @media (max-width:760px) {
          .app {
            padding:11px;
          }

          .topIdentity {
            align-items:flex-start;
            padding:0;
          }

          .badge {
            display:none;
          }

          .layout {
            grid-template-columns:1fr;
          }

          .wavePanel,
          .stage {
            grid-column:auto;
          }

          .stage {
            height:480px;
          }

          .controls {
            height:auto;
            max-height:none;
            overflow:visible;
          }
        }

        @media (max-width:520px) {
          .stage {
            height:410px;
          }
        }
      `}</style>

      <header className="top">
        <div className="topIdentity">
          <a
            className="brandDot"
            href={import.meta.env.BASE_URL}
            aria-label="Back to wave investigations"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            >
              <path d="M3 7h18M3 12h18M3 17h18" />
              <path d="M16 4v16" />
            </svg>
          </a>

          <a
            className="homeLink"
            href="https://awm11.github.io/"
            aria-label="AWM11 home"
          >
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          </a>

          <div className="titleBlock">
            <h1>Wave reflection</h1>
          </div>

          
        </div>
      </header>

      <main
        className={`layout${
          maximized ? " isMax" : ""
        }`}
      >
        <aside className="card controls wavePanel">
          <div className="section">
            Wave
          </div>

          <div className="actionGrid">
            <button
              type="button"
              className="pauseButton"
              onClick={() =>
                setPaused((p) => !p)
              }
            >
              {paused
                ? "▶ Resume"
                : "Ⅱ Pause"}
            </button>

            <button
              type="button"
              className="resetButton"
              onClick={reset}
            >
              ↺ Reset
            </button>
          </div>

          <div className="sliderGrid">
            {control(
              "Angle of incidence",
              angleDeg,
              0,
              65,
              0.5,
              setAngleDeg,
              `${fmt(angleDeg, 1)}°`
            )}

            {control(
              "Wavelength",
              wavelength,
              45,
              125,
              1,
              setWavelength,
              `${fmt(wavelength, 0)} px`
            )}

            {control(
              "Wave speed",
              speed,
              60,
              220,
              5,
              setSpeed,
              `${fmt(speed, 0)} px/s`
            )}

            {control(
              "Beam width",
              beamWidth,
              90,
              240,
              5,
              setBeamWidth,
              `${fmt(beamWidth, 0)} px`
            )}
          </div>

          <div className="toggleGrid">
            <div className="toggleRow">
              <span>Rays</span>

              <button
                type="button"
                role="switch"
                aria-label="Show rays"
                aria-checked={showRays}
                className={`toggle${
                  showRays ? " isOn" : ""
                }`}
                onClick={() =>
                  setShowRays((v) => !v)
                }
              >
                <span className="toggleThumb" />
              </button>
            </div>

            <div className="toggleRow">
              <span>Angles</span>

              <button
                type="button"
                role="switch"
                aria-label="Show angles"
                aria-checked={showAngles}
                className={`toggle${
                  showAngles ? " isOn" : ""
                }`}
                onClick={() =>
                  setShowAngles((v) => !v)
                }
              >
                <span className="toggleThumb" />
              </button>
            </div>

            <div className="toggleRow">
              <span>Wavefronts</span>

              <button
                type="button"
                role="switch"
                aria-label="Show wavefronts"
                aria-checked={showWavefronts}
                className={`toggle${
                  showWavefronts ? " isOn" : ""
                }`}
                onClick={() =>
                  setShowWavefronts((v) => !v)
                }
              >
                <span className="toggleThumb" />
              </button>
            </div>

          </div>
            <div className="formula">
              <h3>
                Law of reflection
              </h3>

              <div className="row">
                <div className="equation big">
                  θᵢ = θᵣ
                </div>

                <div className="label">
                  angle of incidence = angle of reflection
                </div>
              </div>
            </div>

        </aside>

        <section className="card stage">
          <div className="stageToolbar">
            <div className="toolGroup">
              <button
                type="button"
                className="iconButton"
                aria-label={showLegend ? "Hide legend" : "Show legend"}
                title={showLegend ? "Hide legend" : "Show legend"}
                onClick={() => setShowLegend((visible) => !visible)}
              >
                <svg viewBox="0 0 20 20" aria-hidden="true">
                  <path d="M3 5h2M8 5h9M3 10h2M8 10h9M3 15h2M8 15h9" />
                </svg>
              </button>

              <button
                type="button"
                className="iconButton"
                aria-label={
                  maximized
                    ? "Restore simulation"
                    : "Maximize simulation"
                }
                title={
                  maximized
                    ? "Restore"
                    : "Maximize"
                }
                onClick={() => {
                  setMaximized((v) => !v);
                }}
              >
                <svg
                  viewBox="0 0 20 20"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                >
                  {maximized ? (
                    <path d="M7 3v4H3M13 3v4h4M7 17v-4H3m10 4v-4h4" />
                  ) : (
                    <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
                  )}
                </svg>
              </button>

            </div>
          </div>

          <svg
            className="sim"
            viewBox={`0 0 ${W} ${H}`}
            aria-label="Animated plane wave reflection"
          >
            <defs>
              <pattern
                id="hatch"
                width="14"
                height="14"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line
                  x1="0"
                  y1="7"
                  x2="14"
                  y2="7"
                  stroke="#7a8f96"
                  strokeWidth="2.2"
                />
              </pattern>

              <marker
                id="arrow"
                markerWidth="10"
                markerHeight="10"
                refX="8"
                refY="3.5"
                orient="auto"
              >
                <path
                  d="M0,0 L8,3.5 L0,7 z"
                  fill="#245766"
                />
              </marker>

              <filter
                id="softShadow"
                x="-20%"
                y="-20%"
                width="140%"
                height="140%"
              >
                <feDropShadow
                  dx="0"
                  dy="10"
                  stdDeviation="10"
                  floodColor="#46636b"
                  floodOpacity="0.14"
                />
              </filter>
            </defs>

            <rect
              width={W}
              height={H}
              fill="#dcecef"
            />

            <g
              transform={`translate(${W / 2} ${
                H / 2
              }) scale(1) translate(${ 
                -W / 2
              } ${-H / 2})`}
            >
                {/* Enlarged grid extends beyond the simulation bounds. */}
              <g opacity=".22">
                {Array.from(
                  { length: 80 },
                  (_, i) => (
                    <line
                      key={`g-v-${i}`}
                      x1={-3000 + i * 70}
                      y1={-3000}
                      x2={-3000 + i * 70}
                      y2={3000}
                      stroke="#8ea3a8"
                      strokeWidth="1"
                    />
                  )
                )}

                {Array.from(
                  { length: 80 },
                  (_, i) => (
                    <line
                      key={`g-h-${i}`}
                      x1={-3000}
                      y1={-3000 + i * 70}
                      x2={3000}
                      y2={-3000 + i * 70}
                      stroke="#8ea3a8"
                      strokeWidth="1"
                    />
                  )
                )}
              </g>

              {showWavefronts && (
                <g>
                <polygon
                  points={geometry.incidentPolygon
                    .map(
                      (p) =>
                        `${p.x},${p.y}`
                    )
                    .join(" ")}
                  fill="rgba(36,87,102,.055)"
                  stroke="rgba(36,87,102,.18)"
                  strokeWidth="1.2"
                />

                <polygon
                  points={geometry.reflectedPolygon
                    .map(
                      (p) =>
                        `${p.x},${p.y}`
                    )
                    .join(" ")}
                  fill="rgba(45,133,129,.055)"
                  stroke="rgba(45,133,129,.18)"
                  strokeWidth="1.2"
                />

                {incidentRows.map(
                  (seg, i) => (
                    <line
                      key={`i-${i}`}
                      x1={seg[0].x}
                      y1={seg[0].y}
                      x2={seg[1].x}
                      y2={seg[1].y}
                      stroke="#245766"
                      strokeWidth="2.8"
                      opacity=".82"
                    />
                  )
                )}

                {reflectedRows.map(
                  (seg, i) => (
                    <line
                      key={`r-${i}`}
                      x1={seg[0].x}
                      y1={seg[0].y}
                      x2={seg[1].x}
                      y2={seg[1].y}
                      stroke="#2d8581"
                      strokeWidth="2.8"
                      opacity=".72"
                    />
                  )
                )}
                </g>
              )}

              <g filter="url(#softShadow)">
                <rect
                  x={WALL_X}
                  y="44"
                  width="18"
                  height={H - 88}
                  fill="url(#hatch)"
                />

                <line
                  x1={WALL_X}
                  y1="44"
                  x2={WALL_X}
                  y2={H - 44}
                  stroke="#6f8388"
                  strokeWidth="3"
                />

                <text
                  x={WALL_X + 24}
                  y="78"
                  fill="#527078"
                  fontSize="12"
                  fontWeight="700"
                >
                  MIRROR
                </text>
              </g>

              {showRays && (
                <g>
                  {[geometry.incidentRay, geometry.reflectedRay].map(
                    (segment, index) =>
                      segment && (
                        <line
                          key={`ray-${index}`}
                          x1={segment[0].x}
                          y1={segment[0].y}
                          x2={segment[1].x}
                          y2={segment[1].y}
                          stroke={index === 0 ? "#245766" : "#2d8581"}
                          strokeWidth="3.5"
                          opacity=".95"
                        />
                      )
                  )}

                  <Arrow
                    x1={
                      geometry.hit.x -
                      geometry.incident.x *
                        360
                    }
                    y1={
                      geometry.hit.y -
                      geometry.incident.y *
                        360
                    }
                    x2={
                      geometry.hit.x -
                      geometry.incident.x *
                        260
                    }
                    y2={
                      geometry.hit.y -
                      geometry.incident.y *
                        260
                    }
                  />

                  <Arrow
                    stroke="#2d8581"
                    x1={
                      geometry.hit.x +
                      geometry.reflected.x *
                        260
                    }
                    y1={
                      geometry.hit.y +
                      geometry.reflected.y *
                        260
                    }
                    x2={
                      geometry.hit.x +
                      geometry.reflected.x *
                        360
                    }
                    y2={
                      geometry.hit.y +
                      geometry.reflected.y *
                        360
                    }
                  />

                  <text
                    x={incidentBeamLabelPosition.x}
                    y={incidentBeamLabelPosition.y}
                    textAnchor="middle"
                    fill="#245766"
                    fontSize="12"
                    fontWeight="700"
                  >
                    incident beam
                  </text>

                  <text
                    x={reflectedBeamLabelPosition.x}
                    y={reflectedBeamLabelPosition.y}
                    textAnchor="middle"
                    fill="#2d8581"
                    fontSize="12"
                    fontWeight="700"
                  >
                    reflected beam
                  </text>
                </g>
              )}

              <circle
                cx={geometry.hit.x}
                cy={geometry.hit.y}
                r="7"
                fill="#fff"
                stroke="#2d8581"
                strokeWidth="2.5"
              />

              {showAngles && (
                <g>
                  <line
                    x1={
                      geometry.normalLine[0].x
                    }
                    y1={
                      geometry.normalLine[0].y
                    }
                    x2={
                      geometry.normalLine[1].x
                    }
                    y2={
                      geometry.normalLine[1].y
                    }
                    stroke="#748b91"
                    strokeWidth="2"
                    strokeDasharray="7 6"
                  />

                  <text
                    x={geometry.hit.x - 126}
                    y={geometry.hit.y - 18}
                    fill="#71848a"
                    fontSize="11"
                    fontWeight="700"
                  >
                    normal
                  </text>

                  <path
                    d={angleWedgePath(
                      geometry.hit,
                      mul(
                        geometry.incident,
                        -1
                      ),
                      geometry.normal,
                      42
                    )}
                    fill="rgba(14,116,144,.22)"
                    stroke="#0e7490"
                    strokeWidth="2"
                  />

                  <path
                    d={angleWedgePath(
                      geometry.hit,
                      geometry.normal,
                      geometry.reflected,
                      68
                    )}
                    fill="rgba(194,65,12,.22)"
                    stroke="#c2410c"
                    strokeWidth="2"
                  />

                  <rect
                    x={
                      incidenceLabelPosition.x -
                      50
                    }
                    y={
                      incidenceLabelPosition.y -
                      16
                    }
                    width="100"
                    height="30"
                    rx="9"
                    fill="rgba(14,116,144,.16)"
                    stroke="rgba(14,116,144,.55)"
                  />

                  <text
                    x={
                      incidenceLabelPosition.x
                    }
                    y={
                      incidenceLabelPosition.y +
                      5
                    }
                    textAnchor="middle"
                    fill="#0e7490"
                    fontSize="14"
                    fontWeight="800"
                  >
                    {geometry.incidenceText}
                  </text>

                  <rect
                    x={
                      reflectionLabelPosition.x -
                      50
                    }
                    y={
                      reflectionLabelPosition.y -
                      16
                    }
                    width="100"
                    height="30"
                    rx="9"
                    fill="rgba(194,65,12,.16)"
                    stroke="rgba(194,65,12,.55)"
                  />

                  <text
                    x={
                      reflectionLabelPosition.x
                    }
                    y={
                      reflectionLabelPosition.y +
                      5
                    }
                    textAnchor="middle"
                    fill="#c2410c"
                    fontSize="14"
                    fontWeight="800"
                  >
                    {geometry.reflectionText}
                  </text>
                </g>
              )}

            
            </g>
          </svg>

          {showLegend && (
            <aside className="legendWindow" aria-label="Wave diagram legend">
              <div className="legendHeader">
                <span>Legend</span>
                <button
                  type="button"
                  className="legendClose"
                  aria-label="Close legend"
                  onClick={() => setShowLegend(false)}
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="m5 5 10 10M15 5 5 15" />
                  </svg>
                </button>
              </div>

              <div className="legend">
                <div className="legendRow">
                  <span className="legendSwatch" />
                  <span>Incident wavefronts</span>
                </div>

                <div className="legendRow">
                  <span className="legendSwatch" style={{ background: "#2d8581" }} />
                  <span>Reflected wavefronts</span>
                </div>

                <div className="legendRow">
                  <span className="legendWall" />
                  <span>Plane barrier</span>
                </div>

                <div className="legendRow">
                  <span className="legendNormal" />
                  <span>Normal at the point of incidence</span>
                </div>
              </div>
            </aside>
          )}
        </section>

        <div className="hotkeys">
          <span>
            <kbd>Space</kbd> play / pause
          </span>

          <span>
            <kbd>,</kbd>
            <kbd>.</kbd> adjust angle
          </span>

          <span>
            <kbd>Esc</kbd> exit full screen
          </span>

          <BuyMeCoffeeButton />
        </div>
      </main>
    </div>
  );
}

export default App;