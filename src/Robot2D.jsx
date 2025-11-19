// Robot2D.jsx
import React, { useState, useMemo, useEffect } from "react";

/* ===== FK en 2D (x derecha, y arriba) ===== */
function fk2D({ L1, L2, q1, q2 }) {
  const x1 = L1 * Math.cos(q1);
  const y1 = L1 * Math.sin(q1);
  const x2 = x1 + L2 * Math.cos(q1 + q2);
  const y2 = y1 + L2 * Math.sin(q1 + q2);
  return { x1, y1, x2, y2 };
}

/* ===== IK 2R plano con suelo y chequeos de alcance ===== */
function ik2D(L1, L2, x, y, elbow = +1) {
  const yy = Math.max(0, y); // no zona negativa

  const d2 = x * x + yy * yy;
  const d = Math.sqrt(d2);

  // alcance
  const maxR = L1 + L2;
  const minR = Math.abs(L1 - L2);
  if (d > maxR + 1e-6) return null;
  if (d < minR - 1e-6) return null;

  let c2 = (d2 - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  c2 = Math.max(-1, Math.min(1, c2));
  const s2 = elbow * Math.sqrt(Math.max(0, 1 - c2 * c2));
  const q2 = Math.atan2(s2, c2);

  const k1 = L1 + L2 * c2;
  const k2 = L2 * s2;
  const q1 = Math.atan2(yy, x) - Math.atan2(k2, k1);

  return { q1, q2, y: yy };
}

export default function Robot2D({ onBack }) {
  // longitudes (m)
  const [L1, setL1] = useState(0.25);
  const [L2, setL2] = useState(0.18);
  // ángulos (deg)
  const [q1, setQ1] = useState(20);
  const [q2, setQ2] = useState(30);
  const [elbowPref, setElbowPref] = useState(+1);

  // NUEVO: guía para la vista 2D
  const [showHelp, setShowHelp] = useState(false);

  // FK inicial
  const fk0 = fk2D({
    L1,
    L2,
    q1: (q1 * Math.PI) / 180,
    q2: (q2 * Math.PI) / 180,
  });

  // objetivo (solo lo movemos con inputs / click / IK)
  const [target, setTarget] = useState({ x: fk0.x2, y: Math.max(0, fk0.y2) });

  // formulario de cálculo abajo
  const [calc, setCalc] = useState({ x: fk0.x2, y: Math.max(0, fk0.y2) });
  const [calcOut, setCalcOut] = useState(null);

  // cuando cambia target, actualizamos el form de abajo
  useEffect(() => {
    setCalc({ x: target.x, y: target.y });
  }, [target.x, target.y]);

  // dibujo
  const scale = 300; // 1 m = 300 px (en viewBox)
  const viewW = 400;
  const viewH = 260;
  const baseX = 200;
  const baseY = 220; // y hacia abajo

  // puntos que dibujamos
  const armPoints = useMemo(() => {
    const { x1, y1, x2, y2 } = fk2D({
      L1,
      L2,
      q1: (q1 * Math.PI) / 180,
      q2: (q2 * Math.PI) / 180,
    });
    return { x1, y1, x2, y2 };
  }, [L1, L2, q1, q2]);

  // para no pasar el piso
  const wouldGoBelowFloor = (L1m, L2m, q1deg, q2deg) => {
    const { y2 } = fk2D({
      L1: L1m,
      L2: L2m,
      q1: (q1deg * Math.PI) / 180,
      q2: (q2deg * Math.PI) / 180,
    });
    return y2 < 0;
  };

  /* ========== acciones ========== */

  // botón IK principal
  const goToTargetIK = () => {
    const sol = ik2D(L1, L2, target.x, target.y, elbowPref);
    if (!sol) {
      alert("Objetivo fuera de alcance (o debajo del piso).");
      return;
    }
    const q1d = (sol.q1 * 180) / Math.PI;
    const q2d = (sol.q2 * 180) / Math.PI;
    if (wouldGoBelowFloor(L1, L2, q1d, q2d)) {
      alert("Esa configuración deja el efector debajo del piso.");
      return;
    }
    setQ1(q1d);
    setQ2(q2d);
    const { x2, y2 } = fk2D({ L1, L2, q1: sol.q1, q2: sol.q2 });
    setTarget({ x: x2, y: Math.max(0, y2) });
  };

  // cálculo de abajo
  const doCalc = () => {
    const sol = ik2D(L1, L2, calc.x, calc.y, elbowPref);
    if (!sol) {
      setCalcOut({ ok: false });
      return;
    }
    setCalcOut({
      ok: true,
      q1: (sol.q1 * 180) / Math.PI,
      q2: (sol.q2 * 180) / Math.PI,
    });
  };

  const applyCalc = () => {
    if (!calcOut?.ok) return;
    if (wouldGoBelowFloor(L1, L2, calcOut.q1, calcOut.q2)) return;
    setQ1(calcOut.q1);
    setQ2(calcOut.q2);
    const { x2, y2 } = fk2D({
      L1,
      L2,
      q1: (calcOut.q1 * Math.PI) / 180,
      q2: (calcOut.q2 * Math.PI) / 180,
    });
    setTarget({ x: x2, y: Math.max(0, y2) });
  };

  // click en el plano: SOLO fijar objetivo (y corregir por viewBox)
  const handleSvgClick = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();

    // coords en pantalla
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    // pasar a coords del viewBox
    const vx = (px / rect.width) * viewW;
    const vy = (py / rect.height) * viewH;

    // pasar a coords del robot
    const x = (vx - baseX) / scale;
    const y = (baseY - vy) / scale;
    const yClamped = Math.max(0, y);

    setTarget({ x, y: yClamped });
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", padding: 16 }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: 12,
          alignItems: "center",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Robot 2R — Vista 2D</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {/* NUEVO: botón de guía para el modo 2D */}
          <button
            onClick={() => setShowHelp(true)}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#f9fafb",
            }}
          >
            Guía
          </button>
          <button
            onClick={() => setElbowPref((e) => (e === +1 ? -1 : +1))}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            Config: {elbowPref === +1 ? "codo arriba (+1)" : "codo abajo (-1)"}
          </button>
          <button
            onClick={onBack}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            Volver al 3D
          </button>
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
        {/* Panel */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>Longitudes (mm)</h2>
          <label style={{ display: "block", fontSize: 12, marginTop: 6 }}>
            L1
            <input
              type="number"
              value={Math.round(L1 * 1000)}
              onChange={(e) => {
                const m = parseFloat(e.target.value) / 1000;
                if (wouldGoBelowFloor(m, L2, q1, q2)) return;
                setL1(m);
              }}
              style={{
                width: "100%",
                padding: 6,
                border: "1px solid #ddd",
                borderRadius: 8,
              }}
            />
          </label>
          <label style={{ display: "block", fontSize: 12, marginTop: 6 }}>
            L2
            <input
              type="number"
              value={Math.round(L2 * 1000)}
              onChange={(e) => {
                const m = parseFloat(e.target.value) / 1000;
                if (wouldGoBelowFloor(L1, m, q1, q2)) return;
                setL2(m);
              }}
              style={{
                width: "100%",
                padding: 6,
                border: "1px solid #ddd",
                borderRadius: 8,
              }}
            />
          </label>

          <h2 style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>
            Articulaciones (°)
          </h2>
          <label style={{ display: "block", fontSize: 12, marginTop: 6 }}>
            q1
            <input
              type="range"
              min={-180}
              max={180}
              value={q1}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (wouldGoBelowFloor(L1, L2, val, q2)) return;
                setQ1(val);
                const { x2, y2 } = fk2D({
                  L1,
                  L2,
                  q1: (val * Math.PI) / 180,
                  q2: (q2 * Math.PI) / 180,
                });
                setTarget({ x: x2, y: Math.max(0, y2) });
              }}
              style={{ width: "100%" }}
            />
            <span style={{ fontFamily: "monospace" }}>{q1.toFixed(1)}°</span>
          </label>
          <label style={{ display: "block", fontSize: 12, marginTop: 6 }}>
            q2
            <input
              type="range"
              min={-180}
              max={180}
              value={q2}
              onChange={(e) => {
                const val = parseFloat(e.target.value);
                if (wouldGoBelowFloor(L1, L2, q1, val)) return;
                setQ2(val);
                const { x2, y2 } = fk2D({
                  L1,
                  L2,
                  q1: (q1 * Math.PI) / 180,
                  q2: (val * Math.PI) / 180,
                });
                setTarget({ x: x2, y: Math.max(0, y2) });
              }}
              style={{ width: "100%" }}
            />
            <span style={{ fontFamily: "monospace" }}>{q2.toFixed(1)}°</span>
          </label>

          {/* Objetivo */}
          <h2 style={{ fontSize: 14, fontWeight: 600, marginTop: 12 }}>
            Objetivo (mm)
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <label style={{ fontSize: 12 }}>
              x
              <input
                type="number"
                value={Math.round(target.x * 1000)}
                onChange={(e) => {
                  const m = parseFloat(e.target.value) / 1000;
                  setTarget((t) => ({ ...t, x: m }));
                }}
                style={{
                  width: "100%",
                  padding: 6,
                  border: "1px solid #ddd",
                  borderRadius: 8,
                }}
              />
            </label>
            <label style={{ fontSize: 12 }}>
              y
              <input
                type="number"
                value={Math.round(target.y * 1000)}
                onChange={(e) => {
                  let m = parseFloat(e.target.value) / 1000;
                  if (m < 0) m = 0;
                  setTarget((t) => ({ ...t, y: m }));
                }}
                style={{
                  width: "100%",
                  padding: 6,
                  border: "1px solid #ddd",
                  borderRadius: 8,
                }}
              />
            </label>
          </div>
          <button
            onClick={goToTargetIK}
            style={{
              marginTop: 10,
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            Ir al objetivo (IK)
          </button>
          <p style={{ fontSize: 11, color: "#6b7280", marginTop: 6 }}>
            Haz click en el plano para elegir el objetivo y luego pulsa el
            botón.
          </p>
        </div>

        {/* Dibujo 2D */}
        <div style={{ background: "#fff", borderRadius: 12, padding: 16 }}>
          <svg
            width="100%"
            viewBox="0 0 400 260"
            style={{ border: "1px solid #e5e7eb", borderRadius: 8, cursor: "crosshair" }}
            onClick={handleSvgClick}
          >
            {/* suelo */}
            <line x1="0" y1={baseY} x2="400" y2={baseY} stroke="#e5e7eb" strokeWidth="2" />
            {/* círculo de alcance */}
            <circle
              cx={baseX}
              cy={baseY}
              r={(L1 + L2) * scale}
              stroke="#e5e7eb"
              strokeDasharray="4 4"
              fill="none"
            />
            {/* L1 */}
            <line
              x1={baseX}
              y1={baseY}
              x2={baseX + armPoints.x1 * scale}
              y2={baseY - armPoints.y1 * scale}
              stroke="#0ea5e9"
              strokeWidth="6"
              strokeLinecap="round"
            />
            {/* L2 */}
            <line
              x1={baseX + armPoints.x1 * scale}
              y1={baseY - armPoints.y1 * scale}
              x2={baseX + armPoints.x2 * scale}
              y2={baseY - armPoints.y2 * scale}
              stroke="#f97316"
              strokeWidth="6"
              strokeLinecap="round"
            />
            {/* juntas */}
            <circle cx={baseX} cy={baseY} r="6" fill="#111" />
            <circle
              cx={baseX + armPoints.x1 * scale}
              cy={baseY - armPoints.y1 * scale}
              r="5"
              fill="#111"
            />
            {/* efector */}
            <circle
              cx={baseX + armPoints.x2 * scale}
              cy={baseY - armPoints.y2 * scale}
              r="5"
              fill="#22c55e"
            />
            {/* objetivo seleccionado */}
            <circle
              cx={baseX + target.x * scale}
              cy={baseY - target.y * scale}
              r="4"
              fill="none"
              stroke="#2563eb"
              strokeWidth="2"
            />
            <text x="10" y="20" fontSize="10" fill="#6b7280">
              q1={q1.toFixed(1)}° · q2={q2.toFixed(1)}°
            </text>
          </svg>
        </div>
      </div>

      {/* Cálculo IK numérico */}
      <div
        style={{
          marginTop: 16,
          background: "#fff",
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
          Cálculo IK (numérico)
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr) auto auto",
            gap: 8,
            alignItems: "end",
          }}
        >
          <label style={{ fontSize: 12 }}>
            x (mm)
            <input
              type="number"
              value={Math.round(calc.x * 1000)}
              onChange={(e) =>
                setCalc((c) => ({ ...c, x: parseFloat(e.target.value) / 1000 }))
              }
              style={{
                width: "100%",
                padding: 6,
                border: "1px solid #ddd",
                borderRadius: 8,
              }}
            />
          </label>
          <label style={{ fontSize: 12 }}>
            y (mm)
            <input
              type="number"
              value={Math.round(calc.y * 1000)}
              onChange={(e) => {
                let m = parseFloat(e.target.value) / 1000;
                if (m < 0) m = 0;
                setCalc((c) => ({ ...c, y: m }));
              }}
              style={{
                width: "100%",
                padding: 6,
                border: "1px solid #ddd",
                borderRadius: 8,
              }}
            />
          </label>
          <button
            onClick={doCalc}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
              height: 38,
            }}
          >
            Calcular
          </button>
          <button
            onClick={applyCalc}
            disabled={!calcOut?.ok}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: !calcOut?.ok ? "#e5e7eb" : "#fff",
              height: 38,
              opacity: !calcOut?.ok ? 0.5 : 1,
            }}
          >
            Aplicar
          </button>
        </div>
        {calcOut?.ok ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
              marginTop: 12,
            }}
          >
            <div style={{ fontSize: 12 }}>
              <b>q1</b>
              <div style={{ fontFamily: "monospace" }}>
                {calcOut.q1.toFixed(2)}°
              </div>
            </div>
            <div style={{ fontSize: 12 }}>
              <b>q2</b>
              <div style={{ fontFamily: "monospace" }}>
                {calcOut.q2.toFixed(2)}°
              </div>
            </div>
          </div>
        ) : calcOut && !calcOut.ok ? (
          <p style={{ marginTop: 10, color: "#b91c1c", fontSize: 12 }}>
            Punto fuera de alcance o debajo del piso.
          </p>
        ) : null}
      </div>

      {/* NUEVO: Modal de guía para 2D */}
      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff",
              borderRadius: 16,
              padding: 20,
              maxWidth: 460,
              width: "90%",
              boxShadow: "0 10px 40px rgba(0,0,0,.25)",
              fontSize: 13,
              color: "#111827",
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Guía rápida — Robot 2R en 2D
            </h2>
            <p style={{ marginBottom: 8 }}>
              Esta vista muestra un brazo <b>2R plano</b> en el plano X–Y, con
              un suelo que el efector no puede cruzar.
            </p>
            <ul style={{ marginLeft: 16, marginBottom: 8 }}>
              <li>
                Ajusta <b>L1</b> y <b>L2</b> (longitudes) en milímetros.
              </li>
              <li>
                Cambia <b>q1</b> y <b>q2</b> con los deslizadores para ver cómo
                se mueve el brazo.
              </li>
              <li>
                Haz click en el plano para definir un objetivo y luego pulsa{" "}
                <b>“Ir al objetivo (IK)”</b>.
              </li>
              <li>
                Abajo puedes escribir un punto y usar el panel de{" "}
                <b>Cálculo IK</b> para obtener los ángulos que lo alcanzan.
              </li>
            </ul>

            
            <p style={{ marginBottom: 8 }}>
              <b>Actividad didáctica (cuestionario):</b>
            </p>
            <p style={{ marginBottom: 6 }}>
              Observa el dibujo del robot 2R y responde:
            </p>
            <ol style={{ marginLeft: 16, marginBottom: 10 }}>
              <li style={{ marginBottom: 6 }}>
                <b>Pregunta 1 (selección simple):</b>  
                ¿Cuál es una condición necesaria para que un punto objetivo en el plano
                tenga solución de IK para este robot 2R?
                <br />
                a) Que el punto esté dentro del círculo de radio L1 + L2. <br />
                b) Que el punto esté sobre el eje X positivo. <br />
                c) Que L1 = L2.
              </li>
              <li>
                <b>Pregunta 2 (selección simple):</b>  
                Si aumentas las longitudes L1 y L2 (manteniendo la base en el mismo lugar),
                ¿qué ocurre con el círculo de alcance dibujado en la vista 2D?
                <br />
                a) El círculo se hace más grande y el brazo puede llegar más lejos. <br />
                b) El círculo se hace más pequeño. <br />
                c) El círculo queda igual.
              </li>
            </ol>
            <p style={{ marginBottom: 12 }}>
              Después, prueba en el simulador: cambia L1 y L2 y haz clic en distintos
              puntos para verificar si tus respuestas coinciden con el comportamiento
              del robot.
            </p>
            <div style={{ textAlign: "right" }}>
              <button
                onClick={() => setShowHelp(false)}
                style={{
                  padding: "6px 12px",
                  borderRadius: 10,
                  border: "1px solid #ddd",
                  background: "#f9fafb",
                }}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
