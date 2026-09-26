import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import LandingPage from "./LandingPage.jsx";
import ReflectionApp from "./reflectionApp.jsx";

const W = 1200;

const H = 720;

const BLOCK_W = 270;

const BLOCK_H = 440;

const GRID_UNIT_PX = 60;
const INITIAL_BLOCK = { x: 680, y: 360 };

const INITIAL_ANGLE_DEG = 20;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

const rad = (deg) => (deg * Math.PI) / 180;
const WAVE_PHASE_ORIGIN = {
  x: INITIAL_BLOCK.x - (Math.cos(rad(INITIAL_ANGLE_DEG)) * BLOCK_W) / 2,
  y: INITIAL_BLOCK.y - (Math.sin(rad(INITIAL_ANGLE_DEG)) * BLOCK_W) / 2,
};

const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });

const mul = (a, s) => ({ x: a.x * s, y: a.y * s });

const dot = (a, b) => a.x * b.x + a.y * b.y;

const cross = (a, b) => a.x * b.y - a.y * b.x;

const len = (a) => Math.hypot(a.x, a.y);

const unit = (a) => mul(a, 1 / (len(a) || 1));

function labelLineClearance(center, halfWidth, halfHeight, start, end) {
  const direction = unit(sub(end, start));
  const offset = sub(center, start);
  return (
    Math.abs(cross(direction, offset)) -
    halfWidth * Math.abs(direction.y) -
    halfHeight * Math.abs(direction.x)
  );
}

function placeAngleLabel({
  origin,
  normal,
  tangent,
  normalOffset,
  preferredSide,
  tangentOffsets,
  text,
  fontSize,
  obstacles,
}) {
  const halfWidth = text.length * fontSize * 0.29;
  const halfHeight = fontSize * 0.6;
  const minClearance = fontSize * 0.2;
  let bestPosition = null;
  let bestClearance = -Infinity;

  for (const offset of tangentOffsets) {
    for (const side of [preferredSide, -preferredSide]) {
      const position = add(
        add(origin, mul(normal, normalOffset)),
        mul(tangent, side * offset),
      );
      const clearance = Math.min(
        ...obstacles.map(({ start, end }) =>
          labelLineClearance(position, halfWidth, halfHeight, start, end),
        ),
      );

      if (clearance > bestClearance) {
        bestPosition = position;
        bestClearance = clearance;
      }
      if (clearance >= minClearance) return position;
    }
  }

  return bestPosition;
}

function separateAngleLabels(first, second, firstText, secondText, fontSize) {
  const firstHalfWidth = firstText.length * fontSize * 0.29;
  const secondHalfWidth = secondText.length * fontSize * 0.29;
  const labelsOverlap =
    Math.abs(first.x - second.x) < firstHalfWidth + secondHalfWidth &&
    Math.abs(first.y - second.y) < fontSize * 1.4;

  if (!labelsOverlap) return second;

  return {
    x: second.x,
    y: first.y + (second.y >= first.y ? 1.6 : -1.6) * fontSize,
  };
}

function moveAngleLabelLeft(position, distance = 24) {
  return {
    x: position.x - distance,
    y: position.y,
  };
}

function fmt(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function mediumColour(n, inside) {
  const t = clamp((n - 1) / 2.2, 0, 1);

  if (!inside) {
    const l = 97 - 17 * t;

    const s = 20 + 24 * t;

    return `hsl(202 ${s}% ${l}%)`;
  }

  const l = 95 - 29 * t;

  const s = 34 + 34 * t;

  return `hsl(177 ${s}% ${l}%)`;
}

function rotatedRectPoints(cx, cy, angle, w, h) {
  const c = Math.cos(angle);

  const s = Math.sin(angle);

  const ux = { x: c, y: s };

  const uy = { x: -s, y: c };

  const p = (sx, sy) =>
    add(
      { x: cx, y: cy },

      add(mul(ux, sx), mul(uy, sy)),
    );

  return [
    p(-w / 2, -h / 2),

    p(w / 2, -h / 2),

    p(w / 2, h / 2),

    p(-w / 2, h / 2),
  ];
}

function convexHull(points) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);

  if (sorted.length <= 1) {
    return sorted;
  }

  const lower = [];

  for (const p of sorted) {
    while (
      lower.length >= 2 &&
      cross(
        sub(lower[lower.length - 1], lower[lower.length - 2]),

        sub(p, lower[lower.length - 1]),
      ) <= 0
    ) {
      lower.pop();
    }

    lower.push(p);
  }

  const upper = [];

  for (let i = sorted.length - 1; i >= 0; i -= 1) {
    const p = sorted[i];

    while (
      upper.length >= 2 &&
      cross(
        sub(upper[upper.length - 1], upper[upper.length - 2]),

        sub(p, upper[upper.length - 1]),
      ) <= 0
    ) {
      upper.pop();
    }

    upper.push(p);
  }

  lower.pop();

  upper.pop();

  return lower.concat(upper);
}

function linePolygonSegment(direction, distance, polygon) {
  const tangent = {
    x: -direction.y,

    y: direction.x,
  };

  const anchor = mul(direction, distance);

  const hits = [];

  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];

    const b = polygon[(i + 1) % polygon.length];

    const edge = sub(b, a);

    const denom = cross(tangent, edge);

    if (Math.abs(denom) < 1e-9) continue;

    const rel = sub(a, anchor);

    const t = cross(rel, edge) / denom;

    const u = cross(rel, tangent) / denom;

    if (u >= -1e-9 && u <= 1 + 1e-9) {
      hits.push(add(anchor, mul(tangent, t)));
    }
  }

  if (hits.length < 2) return null;

  hits.sort((a, b) => dot(a, tangent) - dot(b, tangent));

  return [hits[0], hits[hits.length - 1]];
}

function angleWedgePath(center, directionA, directionB, radius) {
  const a = Math.atan2(
    directionA.y,

    directionA.x,
  );

  const b = Math.atan2(
    directionB.y,

    directionB.x,
  );

  let delta = b - a;

  while (delta > Math.PI) {
    delta -= 2 * Math.PI;
  }

  while (delta < -Math.PI) {
    delta += 2 * Math.PI;
  }

  const start = {
    x: center.x + radius * Math.cos(a),

    y: center.y + radius * Math.sin(a),
  };

  const end = {
    x: center.x + radius * Math.cos(a + delta),

    y: center.y + radius * Math.sin(a + delta),
  };

  const largeArcFlag = Math.abs(delta) > Math.PI ? 1 : 0;

  const sweepFlag = delta >= 0 ? 1 : 0;

  return `

    M ${center.x} ${center.y}

    L ${start.x} ${start.y}

    A ${radius} ${radius}

      0 ${largeArcFlag} ${sweepFlag}

      ${end.x} ${end.y}

    Z

  `;
}

function createWavefrontSegments({
  direction,
  wavelength,
  phaseOrigin,
  phaseOffset = 0,
  polygon,
}) {
  const extension = mul(direction, wavelength * 2);
  const extendedPolygon = convexHull([
    ...polygon.map((point) => sub(point, extension)),
    ...polygon.map((point) => add(point, extension)),
  ]);

  const projections = extendedPolygon.map(
    (p) =>
      dot(
        direction,

        sub(p, phaseOrigin),
      ) / wavelength,
  );

  const minPhase = Math.min(...projections) - 2;

  const maxPhase = Math.max(...projections) + 2;

  const first = Math.ceil(minPhase + phaseOffset);

  const last = Math.floor(maxPhase + phaseOffset);

  const lines = [];

  for (let i = first; i <= last; i += 1) {
    const spatialPhase = i - phaseOffset;

    const distance = dot(direction, phaseOrigin) + spatialPhase * wavelength;

    const seg = linePolygonSegment(
      direction,

      distance,

      extendedPolygon,
    );

    if (!seg) continue;

    lines.push(
      {
        key: i,
        x1: seg[0].x,
        y1: seg[0].y,
        x2: seg[1].x,
        y2: seg[1].y,
      },
    );
  }

  return lines;
}

function RefractionSimulation() {
  const [wavelengthSquares, setWavelengthSquares] = useState(1.5);

  const [speed1Squares, setSpeed1Squares] = useState(1.5);

  const [n1, setN1] = useState(1.0);

  const [n2, setN2] = useState(1.65);

  const [angleDeg, setAngleDeg] = useState(INITIAL_ANGLE_DEG);

  const [zoom, setZoom] = useState(1.4);

  const [block, setBlock] = useState(INITIAL_BLOCK);

  const phaseRef = useRef(0);
  const incidentWaveRef = useRef(null);
  const internalWaveRef = useRef(null);
  const transmittedWaveRef = useRef(null);

  const [paused, setPaused] = useState(false);

  const [raysVisible, setRaysVisible] = useState(true);

  const [isStageMaximized, setIsStageMaximized] = useState(false);

  const [isDragging, setIsDragging] = useState(false);

  const drag = useRef(null);

  const simRef = useRef(null);

  const frequency = speed1Squares / wavelengthSquares;

  const speed2Squares = (speed1Squares * n1) / n2;

  const wavelength2Squares = (wavelengthSquares * n1) / n2;

  const geometry = useMemo(() => {
    const angle = rad(angleDeg);

    const ux = {
      x: Math.cos(angle),

      y: Math.sin(angle),
    };

    const uy = {
      x: -Math.sin(angle),

      y: Math.cos(angle),
    };

    const incident = {
      x: 1,

      y: 0,
    };

    const normalIncident = dot(incident, ux);

    const tangentIncident = dot(incident, uy);

    const sin1 = clamp(
      tangentIncident,

      -0.999999,

      0.999999,
    );

    const sin2 = clamp(
      (n1 / n2) * sin1,

      -0.999999,

      0.999999,
    );

    const cos2 = Math.sqrt(
      Math.max(
        0,

        1 - sin2 * sin2,
      ),
    );

    const refracted = unit(
      add(
        mul(ux, cos2),

        mul(uy, sin2),
      ),
    );

    const points = rotatedRectPoints(
      block.x,

      block.y,

      angle,

      BLOCK_W,

      BLOCK_H,
    );

    const front = add(
      { x: block.x, y: block.y },

      mul(ux, -BLOCK_W / 2),
    );

    const rear = add(
      { x: block.x, y: block.y },

      mul(ux, BLOCK_W / 2),
    );

    const frontTop = add(
      front,

      mul(uy, -BLOCK_H / 2),
    );

    const frontBottom = add(
      front,

      mul(uy, BLOCK_H / 2),
    );

    const rearTop = add(
      rear,

      mul(uy, -BLOCK_H / 2),
    );

    const rearBottom = add(
      rear,

      mul(uy, BLOCK_H / 2),
    );

    const lambda1Px = wavelengthSquares * GRID_UNIT_PX;

    const lambda2Px = wavelength2Squares * GRID_UNIT_PX;

    const frontPhaseOrigin = front;

    const frontPhaseOffset =
      dot(
        incident,

        sub(front, WAVE_PHASE_ORIGIN),
      ) / lambda1Px;

    const blockNormalDistance = dot(
      sub(rear, front),

      refracted,
    );

    const phaseThroughBlock = blockNormalDistance / lambda2Px;

    const transmittedPhaseOffset = frontPhaseOffset + phaseThroughBlock;

    const frontGradientIncident = tangentIncident / lambda1Px;

    const frontGradientRefracted = dot(refracted, uy) / lambda2Px;

    const frontGradientError = frontGradientIncident - frontGradientRefracted;

    const rearGradientRefracted = dot(refracted, uy) / lambda2Px;

    const rearGradientTransmitted = dot(incident, uy) / lambda1Px;

    const rearGradientError = rearGradientRefracted - rearGradientTransmitted;

    const theta1 =
      (Math.atan2(
        Math.abs(tangentIncident),

        Math.max(
          1e-9,

          normalIncident,
        ),
      ) *
        180) /
      Math.PI;

    const theta2 = (Math.asin(Math.abs(sin2)) * 180) / Math.PI;

    const refractedClipLength = Math.hypot(W, H) * 3;

    const refractedClipPolygon = [
      points[0],
      add(
        points[0],

        mul(
          refracted,

          refractedClipLength,
        ),
      ),

      add(
        points[3],

        mul(
          refracted,

          refractedClipLength,
        ),
      ),

      points[3],
    ];

    const rearEdge = sub(
      points[2],

      points[1],
    );

    const findRearIntersection = (origin) => {
      const denom = cross(
        refracted,

        rearEdge,
      );

      if (Math.abs(denom) < 1e-9) {
        return null;
      }

      const rel = sub(points[1], origin);

      const t =
        cross(
          rel,

          rearEdge,
        ) / denom;

      const u =
        cross(
          rel,

          refracted,
        ) / denom;

      if (t >= -1e-9 && u >= -1e-9 && u <= 1 + 1e-9) {
        return add(
          origin,

          mul(refracted, t),
        );
      }

      return null;
    };

    const transmittedMaskTop = findRearIntersection(points[0]) || points[1];

    const transmittedMaskBottom = findRearIntersection(points[3]) || points[2];

    const refractedExit = findRearIntersection(front) || rear;

    const shadowLength = W + BLOCK_W + 200;

    const translatedPoints = points.map((p) =>
      add(
        p,

        mul(incident, shadowLength),
      ),
    );

    const shadowPoints = convexHull([...points, ...translatedPoints]);

    return {
      ux,

      uy,

      incident,

      refracted,

      points,

      front,

      rear,

      refractedExit,

      frontTop,

      frontBottom,

      rearTop,

      rearBottom,

      lambda1Px,

      lambda2Px,

      frontPhaseOrigin,
      frontPhaseOffset,

      transmittedPhaseOffset,

      phaseThroughBlock,

      frontGradientError,

      rearGradientError,

      theta1,

      theta2,

      shadowPoints,

      refractedClipPolygon,

      transmittedMaskTop,

      transmittedMaskBottom,
    };
  }, [angleDeg, block, n1, n2, wavelengthSquares, wavelength2Squares]);

  const visualCyclesPerSecond = speed1Squares / wavelengthSquares;

  const materialLabel = sub(
    sub(geometry.rearBottom, mul(geometry.ux, 18)),
    mul(geometry.uy, 24),
  );
  const angleLabelSide = angleDeg < 0 ? -1 : 1;
  const labelAngleDeg =
    Math.abs(angleDeg) < 25 ? (angleDeg < 0 ? -25 : 25) : angleDeg;
  const labelAngle = rad(labelAngleDeg);
  const labelUx = {
    x: Math.cos(labelAngle),
    y: Math.sin(labelAngle),
  };
  const labelUy = {
    x: -Math.sin(labelAngle),
    y: Math.cos(labelAngle),
  };
  const labelOrigin =
    Math.abs(angleDeg) < 25
      ? add({ x: block.x, y: block.y }, mul(labelUx, -BLOCK_W / 2))
      : geometry.front;
  const labelSin2 = clamp(
    (n1 / n2) * -Math.sin(labelAngle),
    -0.999999,
    0.999999,
  );
  const labelRefracted = unit(
    add(
      mul(labelUx, Math.sqrt(1 - labelSin2 * labelSin2)),
      mul(labelUy, labelSin2),
    ),
  );
  const angleLabelFontSize = (22 + zoom * 4) / zoom;
  const incidentAngleText = `θ₁ ${geometry.theta1.toFixed(1)}°`;
  const refractedAngleText = `θ₂ ${geometry.theta2.toFixed(1)}°`;
  const normalLine = {
    start: sub(labelOrigin, mul(labelUx, 125)),
    end: add(labelOrigin, mul(labelUx, 125)),
  };
  const labelIncidentRay = {
    start: sub(labelOrigin, mul(geometry.incident, 180)),
    end: labelOrigin,
  };
  const incidentAngleLabel = moveAngleLabelLeft(
    placeAngleLabel({
      origin: labelOrigin,
      normal: mul(labelUx, -1),
      tangent: labelUy,
      normalOffset: 80,
      preferredSide: angleLabelSide,
      tangentOffsets: [44, 64, 84, 104],
      text: incidentAngleText,
      fontSize: angleLabelFontSize,
      obstacles: [labelIncidentRay, normalLine],
    }),
  );
  const refractedAngleLabel = separateAngleLabels(
    incidentAngleLabel,
    moveAngleLabelLeft(
      placeAngleLabel({
        origin: labelOrigin,
        normal: labelUx,
        tangent: labelUy,
        normalOffset: 45,
        preferredSide: -angleLabelSide,
        tangentOffsets: [54, 74, 94, 114],
        text: refractedAngleText,
        fontSize: angleLabelFontSize,
        obstacles: [
          {
            start: labelOrigin,
            end: add(labelOrigin, mul(labelRefracted, 180)),
          },
          normalLine,
        ],
      }),
    ),
    incidentAngleText,
    refractedAngleText,
    angleLabelFontSize,
  );

  React.useEffect(() => {
    let frame;
    let previous = performance.now();

    const tick = (now) => {
      const dt = Math.min(0.05, (now - previous) / 1000);

      previous = now;

      if (!paused) {
        phaseRef.current -= dt * visualCyclesPerSecond;
      }

      const wrappedPhase = ((phaseRef.current % 1) + 1) % 1;
      const incidentDistance = -wrappedPhase * geometry.lambda1Px;
      const internalDistance = -wrappedPhase * geometry.lambda2Px;
      const incidentOffset = mul(geometry.incident, incidentDistance);
      const internalOffset = mul(geometry.refracted, internalDistance);

      incidentWaveRef.current?.setAttribute(
        "transform",
        `translate(${incidentOffset.x} ${incidentOffset.y})`,
      );
      internalWaveRef.current?.setAttribute(
        "transform",
        `translate(${internalOffset.x} ${internalOffset.y})`,
      );
      transmittedWaveRef.current?.setAttribute(
        "transform",
        `translate(${incidentOffset.x} ${incidentOffset.y})`,
      );

      frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(frame);
  }, [
    paused,
    visualCyclesPerSecond,
    geometry.incident,
    geometry.refracted,
    geometry.lambda1Px,
    geometry.lambda2Px,
  ]);

  React.useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === "Escape") {
        setIsStageMaximized(false);
        return;
      }

      const target = event.target;
      if (
        target instanceof Element &&
        target.closest(
          'button, input, textarea, select, [contenteditable="true"]',
        )
      ) {
        return;
      }

      if (event.code === "Comma" || event.code === "Period") {
        event.preventDefault();
        const direction = event.code === "Comma" ? -1 : 1;
        setAngleDeg((current) => clamp(current + direction * 0.5, -65, 65));
        return;
      }

      if (event.code !== "Space" || event.repeat) return;

      event.preventDefault();
      setPaused((current) => !current);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const incidentRows = useMemo(
    () =>
      createWavefrontSegments({
        direction: geometry.incident,
        wavelength: geometry.lambda1Px,
        phaseOrigin: WAVE_PHASE_ORIGIN,
        polygon: [
          { x: -1000, y: -1000 },
          { x: 2200, y: -1000 },
          { x: 2200, y: 1720 },
          { x: -1000, y: 1720 },
        ],
      }),
    [geometry],
  );

  const internalRows = useMemo(
    () =>
      createWavefrontSegments({
        direction: geometry.refracted,
        wavelength: geometry.lambda2Px,
        phaseOrigin: geometry.frontPhaseOrigin,
        phaseOffset: geometry.frontPhaseOffset,
        polygon: geometry.points,
      }),
    [geometry],
  );

  const transmittedWavePolygon = useMemo(
    () => [
      geometry.transmittedMaskTop,
      add(geometry.transmittedMaskTop, { x: 1200, y: 0 }),
      add(geometry.transmittedMaskBottom, { x: 1200, y: 0 }),
      geometry.transmittedMaskBottom,
    ],
    [geometry],
  );

  const transmittedRows = useMemo(
    () =>
      createWavefrontSegments({
        direction: geometry.incident,
        wavelength: geometry.lambda1Px,
        phaseOrigin: geometry.rear,
        phaseOffset: geometry.transmittedPhaseOffset,
        polygon: transmittedWavePolygon,
      }),
    [geometry, transmittedWavePolygon],
  );

  const pointerToWorld = (event) => {
    const svg = event.currentTarget;

    const svgPoint = svg.createSVGPoint();

    svgPoint.x = event.clientX;

    svgPoint.y = event.clientY;

    const { x, y } = svgPoint.matrixTransform(svg.getScreenCTM().inverse());

    return {
      x: W / 2 + (x - W / 2) / zoom,

      y: H / 2 + (y - H / 2) / zoom,
    };
  };

  const onWheel = useCallback((event) => {
    event.preventDefault();

    const delta =
      event.deltaMode === 1
        ? event.deltaY * 16
        : event.deltaMode === 2
          ? event.deltaY * window.innerHeight
          : event.deltaY;

    setZoom((currentZoom) =>
      clamp(currentZoom * Math.exp(-delta * 0.005), 1, 4),
    );
  }, []);

  useEffect(() => {
    const svg = simRef.current;

    if (!svg) return undefined;

    svg.addEventListener("wheel", onWheel, { passive: false });

    return () => svg.removeEventListener("wheel", onWheel);
  }, [onWheel]);

  const isInsideBlock = (p) => {
    const rel = sub(p, block);

    return (
      Math.abs(
        dot(
          rel,

          geometry.ux,
        ),
      ) <=
        BLOCK_W / 2 &&
      Math.abs(
        dot(
          rel,

          geometry.uy,
        ),
      ) <=
        BLOCK_H / 2
    );
  };

  const rotationHandlePosition = add(
    geometry.points[2],
    mul(unit(add(geometry.ux, geometry.uy)), 26),
  );

  const onPointerDown = (event) => {
    const p = pointerToWorld(event);

    if (len(sub(p, rotationHandlePosition)) <= 24) {
      event.currentTarget.setPointerCapture(event.pointerId);

      drag.current = {
        id: event.pointerId,

        mode: "rotate",

        startAngle: angleDeg,

        startPointerAngle: Math.atan2(
          p.y - block.y,

          p.x - block.x,
        ),
      };

      setIsDragging(true);

      return;
    }

    if (!isInsideBlock(p)) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);

    drag.current = {
      id: event.pointerId,

      mode: "move",

      offset: sub(
        p,

        block,
      ),
    };

    setIsDragging(true);
  };

  const onPointerMove = (event) => {
    if (!drag.current || drag.current.id !== event.pointerId) {
      return;
    }

    const p = pointerToWorld(event);

    if (drag.current.mode === "rotate") {
      const pointerAngle = Math.atan2(
        p.y - block.y,

        p.x - block.x,
      );

      let angleDelta = pointerAngle - drag.current.startPointerAngle;

      while (angleDelta > Math.PI) angleDelta -= 2 * Math.PI;

      while (angleDelta < -Math.PI) angleDelta += 2 * Math.PI;

      setAngleDeg(
        clamp(
          drag.current.startAngle + (angleDelta * 180) / Math.PI,

          -65,

          65,
        ),
      );

      return;
    }

    setBlock({
      x: clamp(
        p.x - drag.current.offset.x,

        40 + BLOCK_W / 2,

        W - 40 - BLOCK_W / 2,
      ),

      y: clamp(
        p.y - drag.current.offset.y,

        40 + BLOCK_H / 2,

        H - 40 - BLOCK_H / 2,
      ),
    });
  };

  const onPointerUp = (event) => {
    if (drag.current?.id !== event.pointerId) {
      return;
    }

    drag.current = null;

    setIsDragging(false);

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Some pointer capture releases can fail harmlessly when the
      // pointer is already detached.
    }
  };

  const control = (
    label,

    value,

    min,

    max,

    step,

    onChange,

    display,
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

        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );

  return (
    <div className="app">
      <style>{`

        :root {

          font-family: Inter, ui-sans-serif, system-ui,

            -apple-system, BlinkMacSystemFont, "Segoe UI",

            sans-serif;

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

          background:

            linear-gradient(

              135deg,

              #eef7f8,

              #dce9ed

            );

          overflow-x: hidden;

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

          gap: 18px;

          position: relative;

        }

        .topIdentity {

          display: flex;

          align-items: center;

          gap: 14px;

          justify-content: center;

          width: 100%;

          padding: 0 56px;

          box-sizing: border-box;

          text-align: center;

        }

        .homeLink {

          display: inline-flex;

          flex: 0 0 auto;

          position: absolute;

          left: 0;

          top: 50%;

          transform: translateY(-50%);

          width: 46px;

          height: 46px;

          border-radius: 11px;

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

          font-size:

            clamp(24px, 2.6vw, 34px);

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

          border:

            1px solid

            rgba(38,72,81,.11);

          border-radius: 999px;

          background:

            rgba(255,255,255,.78);

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

          grid-template-columns:

            278px

            minmax(0, 1fr)

            292px;

          gap: 12px;

          align-items: stretch;

        }

        .hotkeys {

          order: 4;

          grid-column: 1 / -1;

          display: flex;

          justify-content: center;

          align-items: center;

          flex-wrap: wrap;

          gap: 8px 18px;

          padding: 8px 12px;

          color: #607980;

          font-size: 12px;

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

          background:

            rgba(255,255,255,.8);

          border:

            1px solid

            rgba(38,72,81,.11);

          border-radius: 18px;

          overflow: hidden;

          box-shadow:

            0 15px 40px

            rgba(47,76,85,.11);

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

        .wavefrontGroup {

          will-change: transform;

        }

        .blockShape,
        .rotationHandleHitArea {

          cursor: grab;

        }

        .sim.isDragging,
        .sim.isDragging .blockShape,
        .sim.isDragging .rotationHandleHitArea {

          cursor: grabbing;

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

        .panelExpandButton {

          position: absolute;

          top: 12px;

          left: 12px;

          z-index: 1;

          display: grid;

          place-items: center;

          width: 32px;

          height: 32px;

          padding: 0;

          border: 1px solid rgba(49,79,88,.18);

          border-radius: 8px;

          background: #fff;

          color: #245766;

          cursor: pointer;

        }

        .panelExpandButton:hover {

          background: #edf6f7;

        }

        .panelExpandButton:focus-visible {

          outline: 2px solid #245766;

          outline-offset: 2px;

        }

        .panelExpandButton svg {

          width: 17px;

          height: 17px;

          fill: none;

          stroke: currentColor;

          stroke-width: 1.8;

          stroke-linecap: round;

          stroke-linejoin: round;

        }

        .layout.isStageMaximized {

          position: fixed;

          inset: 0;

          z-index: 1000;

          display: block;

          padding: 16px;

          background: linear-gradient(135deg, #eef7f8, #dce9ed);

        }

        .layout.isStageMaximized > :not(.stage) {

          display: none;

        }

        .layout.isStageMaximized .stage {

          width: 100%;

          height: 100%;

          max-height: none;

          border-radius: 12px;

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

          border-top:

            1px solid

            rgba(49,79,88,.1);

          padding-top: 9px;

        }

        .controlHead {

          display: flex;

          align-items: center;

          justify-content: space-between;

          gap: 7px;

          margin-bottom: 5px;

        }

        .controlHead label {

          font-size: 11px;

          line-height: 1.25;

          font-weight: 680;

        }

        output {

          flex-shrink: 0;

          padding: 4px 6px;

          border-radius: 7px;

          background: #edf6f7;

          color: #295a67;

          font-size: 9px;

          font-weight: 800;

          font-variant-numeric:

            tabular-nums;

        }

        input[type=range] {

          width: 100%;

          margin: 0;

          accent-color: #2f7384;

        }

        .pauseButton {

          width: 100%;

          padding: 9px 10px;

          border: 1px solid #2a6168;

          border-radius: 9px;

          background: #edf6f7;

          color: #245766;

          font-size: 11px;

          font-weight: 800;

          cursor: pointer;

        }

        .pauseButton:hover {

          background: #e3f1f3;

        }

        .rayToggleRow {

          display: flex;

          align-items: center;

          justify-content: space-between;

          gap: 10px;

          padding: 2px 1px;

          color: #35545c;

          font-size: 11px;

          font-weight: 750;

        }

        .rayToggle {

          position: relative;

          flex: 0 0 auto;

          width: 48px;

          height: 27px;

          padding: 3px;

          border: 1px solid #8a9ca0;

          border-radius: 999px;

          background: #e2e9ea;

          cursor: pointer;

          transition: background 160ms ease, border-color 160ms ease;

        }

        .rayToggle.isOn {

          border-color: #246f70;

          background: #2d8581;

        }

        .rayToggle:focus-visible {

          outline: 2px solid #245766;

          outline-offset: 2px;

        }

        .rayToggleThumb {

          display: block;

          width: 19px;

          height: 19px;

          border-radius: 50%;

          background: #fff;

          box-shadow: 0 1px 3px rgba(18, 48, 54, .28);

          transform: translateX(0);

          transition: transform 160ms ease;

        }

        .rayToggle.isOn .rayToggleThumb {

          transform: translateX(21px);

        }

        .metrics {

          display: grid;

          grid-template-columns:

            1fr 1fr;

          gap: 6px;

        }

        .metric {

          min-width: 0;

          padding: 7px;

          border-radius: 9px;

          background: #f3f8f9;

          border:

            1px solid

            rgba(49,79,88,.07);

        }

        .metric span {

          display: block;

          color: #74888e;

          font-size: 8px;

          line-height: 1.2;

          margin-bottom: 2px;

        }

        .metric strong {

          display: block;

          font-size: 10px;

          line-height: 1.2;

          font-variant-numeric:

            tabular-nums;

        }

        .metric small {

          display: block;

          margin-top: 2px;

          color: #7b8d92;

          font-size: 8px;

          line-height: 1.2;

          font-weight: 650;

        }

        .note {

          padding: 9px 10px;

          border:

            1px dashed

            rgba(49,79,88,.16);

          border-radius: 10px;

          background: #f8fbfb;

          color: #657a81;

          font-size: 10px;

          line-height: 1.4;

        }

        .legend {

          display: flex;

          flex-direction: column;

          gap: 6px;

          color: #657b82;

          font-size: 10px;

        }

        .legendRow {

          display: flex;

          align-items: center;

          gap: 7px;

        }

        .wave {

          flex: 0 0 auto;

          width: 21px;

          height: 4px;

          border-radius: 999px;

          background: #245766;

        }

        .blockChip {

          flex: 0 0 auto;

          width: 21px;

          height: 13px;

          border-radius: 4px;

          border:

            1px solid

            #2a6168;

        }

        .wavePanel {

          order: 1;

        }

        .stage {

          order: 2;

        }

        .rightPanel {

          order: 3;

        }

        @media (max-width: 1180px) {

          .app {

            max-width: 1220px;

            padding-left: 12px;

            padding-right: 12px;

          }

          .layout {

            grid-template-columns:

              220px

              minmax(0, 1fr)

              270px;

            gap: 10px;

          }

          .controls {

            padding: 12px;

          }

        }

        @media (max-width: 1000px) {

          .layout {

            grid-template-columns:

              225px

              minmax(0, 1fr);

          }

          .rightPanel {

            grid-column: 1 / -1;

            height: auto;

            max-height: none;

          }

          .rightPanel .note {

            max-width: 700px;

          }

        }

        @media (max-width: 760px) {

          .app {

            padding: 11px;

          }

          .top {

            flex-direction: column;

            align-items: flex-start;

          }

          .badge {

            display: none;

          }

          .layout {

            grid-template-columns: 1fr;

          }

          .wavePanel,

          .stage,

          .rightPanel {

            grid-column: auto;

          }

          .stage {

            height: 480px;

          }

          .controls {

            height: auto;

            max-height: none;

            overflow: visible;

          }

        }

        @media (max-width: 520px) {

          .metrics {

            grid-template-columns:

              1fr 1fr;

          }

          .stage {

            height: 410px;

          }

        }

      `}</style>

      <header className="top">
        <div className="topIdentity">
          <a
            className="homeLink"

            href="https://awm11.github.io/"

            aria-label="AWM11 home"
          >
            <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
          </a>

          <div>
            <h1 style={{ color: "gray" }}>Plane-wave refraction</h1>

            <p className="sub">
              Drag the block, rotate its boundary, or adjust the wave and
              material properties.
            </p>
          </div>
        </div>
      </header>

      <main className={`layout${isStageMaximized ? " isStageMaximized" : ""}`}>
        <aside className="card controls wavePanel">
          <div className="section">Wave</div>

          <button
            type="button"

            className="pauseButton"

            onClick={() => setPaused((p) => !p)}
          >
            {paused ? "▶ Resume" : "Ⅱ Pause"}
          </button>

          <div className="rayToggleRow">
            <span>Show rays &amp; angles</span>

            <button
              type="button"

              role="switch"

              className={`rayToggle${raysVisible ? " isOn" : ""}`}

              aria-label="Show rays and angles"

              aria-checked={raysVisible}

              onClick={() => setRaysVisible((visible) => !visible)}
            >
              <span className="rayToggleThumb" />
            </button>
          </div>

          {control(
            "Wavelength in medium 1",

            wavelengthSquares,

            0.4,

            3,

            0.05,

            setWavelengthSquares,

            `${fmt(
              wavelengthSquares,

              2,
            )} squares`,
          )}

          {control(
            "Wave speed outside block (v₁)",

            speed1Squares,

            0.4,

            4,

            0.05,

            setSpeed1Squares,

            `${fmt(
              speed1Squares,

              2,
            )} squares/s`,
          )}

          <div className="metrics">
            <div className="metric">
              <span>Frequency</span>

              <strong>
                {fmt(
                  frequency,

                  2,
                )}{" "}
                Hz
              </strong>
            </div>

            <div className="metric">
              <span>λ in medium 1</span>

              <strong>
                {fmt(
                  wavelengthSquares,

                  2,
                )}{" "}
                squares
              </strong>
            </div>

            <div className="metric">
              <span>λ in medium 2</span>

              <strong>
                {fmt(
                  wavelength2Squares,

                  2,
                )}{" "}
                squares
              </strong>
            </div>

            <div className="metric">
              <span>Speed inside block (v₂)</span>

              <strong>
                {fmt(
                  speed2Squares,

                  2,
                )}{" "}
                squares/s
              </strong>
            </div>

            <div className="metric">
              <span>Speed outside block (v₁)</span>

              <strong>
                {fmt(
                  speed1Squares,

                  2,
                )}{" "}
                squares/s
              </strong>
            </div>

            <div className="metric">
              <span>Angles</span>

              <strong>
                {geometry.theta1.toFixed(1)}°{" → "}
                {geometry.theta2.toFixed(1)}°
              </strong>
            </div>
          </div>

          <div
            style={{
              marginTop: "18px",
              padding: "16px",
              background: "#f5f8f8",
              border: "1px solid #d8e2e3",
              borderRadius: "10px",
            }}
          >
            <h3
              style={{
                margin: "0 0 14px 0",
                fontSize: "15px",
                fontWeight: 600,
                color: "#263b40",
              }}
            >
              Snell's law
            </h3>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "14px",
              }}
            >
              {/* Equation */}
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#52656b",
                    marginBottom: "5px",
                  }}
                >
                  Equation
                </div>

                <div
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "15px",
                    color: "#263b40",
                  }}
                >
                  n₁ sin(θ₁) = n₂ sin(θ₂)
                </div>
              </div>

              {/* Rearrange */}
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#52656b",
                    marginBottom: "7px",
                  }}
                >
                  Rearrange
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontFamily: "Georgia, serif",
                    fontSize: "15px",
                    color: "#263b40",
                  }}
                >
                  <span>sin(θ₂) =</span>

                  <span
                    style={{
                      display: "inline-flex",
                      flexDirection: "column",
                      alignItems: "center",
                      lineHeight: 1.2,
                    }}
                  >
                    <span
                      style={{
                        padding: "0 8px 3px",
                        borderBottom: "1px solid #263b40",
                      }}
                    >
                      n₁ sin(θ₁)
                    </span>
                    <span style={{ paddingTop: "3px" }}>n₂</span>
                  </span>
                </div>
              </div>

              {/* Substitute */}
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#52656b",
                    marginBottom: "7px",
                  }}
                >
                  Substitute values
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    fontFamily: "Georgia, serif",
                    fontSize: "15px",
                    color: "#263b40",
                  }}
                >
                  <span>sin(θ₂) =</span>

                  <span
                    style={{
                      display: "inline-flex",
                      flexDirection: "column",
                      alignItems: "center",
                      lineHeight: 1.2,
                    }}
                  >
                    <span
                      style={{
                        padding: "0 8px 3px",
                        borderBottom: "1px solid #263b40",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {n1.toFixed(2)} × sin({angleDeg.toFixed(1)}°)
                    </span>

                    <span style={{ paddingTop: "3px" }}>{n2.toFixed(2)}</span>
                  </span>
                </div>
              </div>

              {/* Calculate */}
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#52656b",
                    marginBottom: "5px",
                  }}
                >
                  Calculate
                </div>

                <div
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "15px",
                    color: "#263b40",
                  }}
                >
                  sin(θ₂) = {((n1 * Math.sin(rad(angleDeg))) / n2).toFixed(3)}
                </div>
              </div>

              {/* Answer */}
              <div
                style={{
                  paddingTop: "10px",
                  borderTop: "1px solid #d8e2e3",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "#52656b",
                    marginBottom: "5px",
                  }}
                >
                  Therefore
                </div>

                <div
                  style={{
                    fontFamily: "Georgia, serif",
                    fontSize: "18px",
                    fontWeight: 600,
                    color: "#245b63",
                  }}
                >
                  θ₂ ={" "}
                  {(
                    (Math.asin(
                      clamp((n1 * Math.sin(rad(angleDeg))) / n2, -1, 1),
                    ) *
                      180) /
                    Math.PI
                  ).toFixed(1)}
                  °
                </div>
              </div>
            </div>
          </div>
        </aside>

        <section className="card stage">
          <button
            type="button"

            className="panelExpandButton"

            aria-label={
              isStageMaximized
                ? "Restore simulation pane"
                : "Maximize simulation pane"
            }

            title={
              isStageMaximized
                ? "Restore simulation pane"
                : "Maximize simulation pane"
            }

            onClick={(event) => {
              setIsStageMaximized((maximized) => !maximized);
              event.currentTarget.blur();
            }}
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              {isStageMaximized ? (
                <path d="M7 3v4H3M13 3v4h4M7 17v-4H3m10 4v-4h4" />
              ) : (
                <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />
              )}
            </svg>
          </button>

          <svg
            ref={simRef}

            className={isDragging ? "sim isDragging" : "sim"}

            viewBox={`0 0 ${W} ${H}`}

            preserveAspectRatio="xMidYMid meet"

            onPointerDown={onPointerDown}

            onPointerMove={onPointerMove}

            onPointerUp={onPointerUp}

            onPointerCancel={onPointerUp}
          >
            <defs>
              <marker
                id="rayArrow"
                viewBox="0 0 10 10"
                refX="8"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto"
              >
                <path
                  d="M 1 1 L 9 5 L 1 9"
                  fill="none"
                  stroke="rgba(22,57,67,.65)"
                  strokeWidth="1.2"
                  strokeLinejoin="round"
                />
              </marker>

              <mask id="incident-wave-mask">
                <rect
                  x="-1000"

                  y="-1000"

                  width="3200"

                  height="2720"

                  fill="white"
                />

                <polygon
                  points={geometry.shadowPoints

                    .map((p) => `${p.x},${p.y}`)

                    .join(" ")}

                  fill="black"
                />
              </mask>

              <clipPath
                id="refracted-ray-clip"

                clipPathUnits="userSpaceOnUse"
              >
                <polygon
                  points={geometry.refractedClipPolygon

                    .map((p) => `${p.x},${p.y}`)

                    .join(" ")}
                />
              </clipPath>

              <clipPath
                id="refracted-block-clip"

                clipPathUnits="userSpaceOnUse"
              >
                <polygon
                  points={geometry.points

                    .map((p) => `${p.x},${p.y}`)

                    .join(" ")}
                />
              </clipPath>

                <clipPath
                  id="transmitted-wave-clip"
                  clipPathUnits="userSpaceOnUse"
                >
                  <polygon
                    points={transmittedWavePolygon
                      .map((point) => `${point.x},${point.y}`)
                      .join(" ")}
                  />
                </clipPath>
            </defs>

            <rect
              x="0"

              y="0"

              width={W}

              height={H}

              fill={mediumColour(
                n1,

                false,
              )}
            />

            <g
              transform={`

                translate(

                  ${W / 2}

                  ${H / 2}

                )

                scale(${zoom})

                translate(

                  ${-W / 2}

                  ${-H / 2}

                )

              `}
            >
              <rect
                x="-1000"

                y="-1000"

                width="3200"

                height="2720"

                fill={mediumColour(
                  n1,

                  false,
                )}
              />

              <g opacity=".13">
                {Array.from(
                  { length: 54 },

                  (_, i) => (
                    <line
                      key={`v${i}`}

                      x1={-1000 + i * GRID_UNIT_PX}

                      x2={-1000 + i * GRID_UNIT_PX}

                      y1="-1000"

                      y2="1720"

                      stroke="#2d606d"
                    />
                  ),
                )}

                {Array.from(
                  { length: 46 },

                  (_, i) => (
                    <line
                      key={`h${i}`}

                      x1="-1000"

                      x2="2200"

                      y1={-1000 + i * GRID_UNIT_PX}

                      y2={-1000 + i * GRID_UNIT_PX}

                      stroke="#2d606d"
                    />
                  ),
                )}
              </g>

              <g mask="url(#incident-wave-mask)">
                <g className="wavefrontGroup" ref={incidentWaveRef}>
                  {incidentRows.map((line) => (
                    <line
                      key={line.key}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      stroke="#1f5968"
                      strokeWidth="2.6"
                      opacity="0.88"
                    />
                  ))}
                </g>
              </g>

              <polygon
                className="blockShape"

                points={geometry.points

                  .map((p) => `${p.x},${p.y}`)

                  .join(" ")}

                fill={mediumColour(
                  n2,

                  true,
                )}

                stroke="#2a6168"

                strokeWidth="3"
              />

              <line
                className="blockShape"

                x1={geometry.points[0].x}

                y1={geometry.points[0].y}

                x2={geometry.points[1].x}

                y2={geometry.points[1].y}

                stroke="black"

                strokeWidth="6"
              />

              <line
                className="blockShape"

                x1={geometry.points[2].x}

                y1={geometry.points[2].y}

                x2={geometry.points[3].x}

                y2={geometry.points[3].y}

                stroke="black"

                strokeWidth="6"
              />

              <g clipPath="url(#refracted-ray-clip)">
                <g clipPath="url(#refracted-block-clip)">
                  <g className="wavefrontGroup" ref={internalWaveRef}>
                    {internalRows.map((line) => (
                      <line
                        key={line.key}
                        x1={line.x1}
                        y1={line.y1}
                        x2={line.x2}
                        y2={line.y2}
                        stroke="#174f5d"
                        strokeWidth="2.6"
                        opacity="0.84"
                      />
                    ))}
                  </g>
                </g>
              </g>

              <g clipPath="url(#transmitted-wave-clip)">
                <g className="wavefrontGroup" ref={transmittedWaveRef}>
                  {transmittedRows.map((line) => (
                    <line
                      key={line.key}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      stroke="#174f5d"
                      strokeWidth="2.6"
                      opacity="0.84"
                    />
                  ))}
                </g>
              </g>

              {/* Angle shading at first boundary */}
              <g display={raysVisible ? "inline" : "none"}>
                <path
                  d={angleWedgePath(
                    geometry.front,

                    mul(geometry.incident, -1),

                    mul(geometry.ux, -1),

                    72,
                  )}

                  fill="rgba(14,116,144,.22)"

                  stroke="#0e7490"

                  strokeWidth="1.5"
                />

                <path
                  d={angleWedgePath(
                    geometry.front,

                    geometry.ux,

                    geometry.refracted,

                    54,
                  )}

                  fill="rgba(194,65,12,.22)"

                  stroke="#c2410c"

                  strokeWidth="1.5"
                />
              </g>

              <line
                x1={geometry.frontTop.x}

                y1={geometry.frontTop.y}

                x2={geometry.frontBottom.x}

                y2={geometry.frontBottom.y}

                stroke="rgba(255,255,255,.55)"

                strokeWidth="4"
              />

              <line
                x1={geometry.rearTop.x}

                y1={geometry.rearTop.y}

                x2={geometry.rearBottom.x}

                y2={geometry.rearBottom.y}

                stroke="rgba(255,255,255,.55)"

                strokeWidth="4"
              />

              <line
                x1={geometry.front.x - 125 * geometry.ux.x}

                y1={geometry.front.y - 125 * geometry.ux.y}

                x2={geometry.front.x + 125 * geometry.ux.x}

                y2={geometry.front.y + 125 * geometry.ux.y}

                stroke="rgba(22,57,67,.4)"

                strokeWidth="2"

                strokeDasharray="8 8"

                display={raysVisible ? "inline" : "none"}
              />

              <g display={raysVisible ? "inline" : "none"}>
                {/* Incident ray */}
                <line
                  x1={geometry.front.x - 180}
                  y1={geometry.front.y}
                  x2={geometry.front.x - 90}
                  y2={geometry.front.y}
                  stroke="rgba(22,57,67,.55)"
                  strokeWidth="3"
                  markerEnd="url(#rayArrow)"
                />

                <line
                  x1={geometry.front.x - 90}
                  y1={geometry.front.y}
                  x2={geometry.front.x}
                  y2={geometry.front.y}
                  stroke="rgba(22,57,67,.55)"
                  strokeWidth="3"
                />

                {/* Refracted ray */}
                <line
                  x1={geometry.front.x}
                  y1={geometry.front.y}
                  x2={geometry.front.x + 75 * geometry.refracted.x}
                  y2={geometry.front.y + 75 * geometry.refracted.y}
                  stroke="rgba(22,57,67,.55)"
                  strokeWidth="3"
                  markerEnd="url(#rayArrow)"
                />

                <line
                  x1={geometry.front.x + 75 * geometry.refracted.x}
                  y1={geometry.front.y + 75 * geometry.refracted.y}
                  x2={geometry.refractedExit.x}
                  y2={geometry.refractedExit.y}
                  stroke="rgba(22,57,67,.55)"
                  strokeWidth="3"
                />

                {/* Transmitted ray */}
                <line
                  x1={geometry.refractedExit.x}
                  y1={geometry.refractedExit.y}
                  x2={geometry.refractedExit.x + 85}
                  y2={geometry.refractedExit.y}
                  stroke="rgba(22,57,67,.55)"
                  strokeWidth="3"
                  markerEnd="url(#rayArrow)"
                />

                <line
                  x1={geometry.refractedExit.x + 85}
                  y1={geometry.refractedExit.y}
                  x2={geometry.refractedExit.x + 170}
                  y2={geometry.refractedExit.y}
                  stroke="rgba(22,57,67,.55)"
                  strokeWidth="3"
                />
              </g>

              <text
                x={materialLabel.x}
                y={materialLabel.y}
                transform={`rotate(${angleDeg} ${materialLabel.x} ${materialLabel.y})`}
                textAnchor="end"
                fill="rgba(20,60,70,.82)"
                fontSize="17"
                fontWeight="750"
              >
                n₂ = {n2.toFixed(2)}
              </text>

              <g display={raysVisible ? "inline" : "none"}>
                <text
                  x={incidentAngleLabel.x}
                  y={incidentAngleLabel.y}
                  textAnchor="middle"
                  fill="#0e7490"
                  fontSize={angleLabelFontSize}
                  fontWeight="700"
                >
                  θ₁ {geometry.theta1.toFixed(1)}°
                </text>

                <text
                  x={refractedAngleLabel.x}
                  y={refractedAngleLabel.y}
                  textAnchor="middle"
                  fill="#c2410c"
                  fontSize={angleLabelFontSize}
                  fontWeight="700"
                >
                  θ₂ {geometry.theta2.toFixed(1)}°
                </text>
              </g>

              <polygon
                className="blockShape"
                points={geometry.points.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="transparent"
                pointerEvents="all"
              />
              <circle
                className="rotationHandleHitArea"
                cx={rotationHandlePosition.x}
                cy={rotationHandlePosition.y}
                r="24"
                fill="transparent"
              />
              <line
                x1={geometry.points[2].x}
                y1={geometry.points[2].y}
                x2={rotationHandlePosition.x}
                y2={rotationHandlePosition.y}
                stroke="#245b63"
                strokeWidth="2"
              />
              <circle
                className="rotationHandleHitArea"
                cx={rotationHandlePosition.x}
                cy={rotationHandlePosition.y}
                r="16"
                fill="#ffffff"
                stroke="#245b63"
                strokeWidth="2.5"
              />
              <text
                x={rotationHandlePosition.x}
                y={rotationHandlePosition.y + 6}
                textAnchor="middle"
                fill="#245b63"
                fontSize="20"
                fontWeight="700"
                pointerEvents="none"
              >
                ↻
              </text>
            </g>
          </svg>
        </section>

        <aside className="card controls rightPanel">
          <div className="section">Materials</div>

          {control(
            "Refractive index n₁",

            n1,

            1,

            2.4,

            0.01,

            setN1,

            n1.toFixed(2),
          )}

          {control(
            "Refractive index n₂",

            n2,

            1.1,

            3.2,

            0.01,

            setN2,

            n2.toFixed(2),
          )}

          <div className="section">Geometry & view</div>

          {control(
            "Boundary / block angle",

            angleDeg,

            -65,

            65,

            0.5,

            setAngleDeg,

            `${angleDeg.toFixed(1)}°`,
          )}

          {control(
            "Zoom",

            zoom,

            1,

            4,

            0.01,

            setZoom,

            `${zoom.toFixed(2)}×`,
          )}

          <div className="legend">
            <div className="legendRow">
              <span className="wave" />

              <span>Wavefronts</span>
            </div>

            <div className="legendRow">
              <span
                className="blockChip"
                style={{ background: mediumColour(n2, true) }}
              />

              <span>Block with n₂</span>
            </div>
          </div>

          <div className="note">
            The square background is the simulation's spatial unit:
            <br />
            <br />
            <strong>1 square = {GRID_UNIT_PX} px</strong>
            <br />
            <br />
            Wavelength is measured in squares and speed is measured in squares
            per second. Frequency is calculated directly as
            <br />
            <br />
            <strong>frequency = speed ÷ wavelength</strong>
            <br />
            <br />
            so the wave spacing, animation speed, and displayed values all use
            the same spatial scale.
            <br />
          </div>
        </aside>

        <div className="hotkeys" aria-label="Keyboard shortcuts">
          <span>
            <kbd>Space</kbd> Pause / resume
          </span>

          <span>
            <kbd>Esc</kbd> Exit maximize
          </span>

          <span>
            <kbd>,</kbd> Rotate anti-clockwise
          </span>

          <span>
            <kbd>.</kbd> Rotate clockwise
          </span>

          <span>
            <span aria-hidden="true">🔍</span> Pinch trackpad / scroll mouse
            wheel to zoom
          </span>
        </div>
      </main>
    </div>
  );
}

function App() {
  const basePath = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const currentPath = window.location.pathname.replace(/\/+$/, "");

  if (currentPath === `${basePath}/refraction`) return <RefractionSimulation />;
  if (currentPath === `${basePath}/reflection`) return <ReflectionApp />;

  return (
    <LandingPage
      refractionPath={`${basePath}/refraction/`}
      reflectionPath={`${basePath}/reflection/`}
    />
  );
}

export default App;
