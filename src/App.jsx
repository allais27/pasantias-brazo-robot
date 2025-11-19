import React, { useMemo, useRef, useState, useEffect } from "react";
import * as THREE from "three";
import { Canvas, extend, useThree } from "@react-three/fiber";
import { OrbitControls as ThreeOrbitControls } from "three-stdlib";
import Robot2D from "./Robot2D.jsx"; // nuevo

extend({ OrbitControls: ThreeOrbitControls });

/* ================= Utils ================= */
const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const easeInOutCubic = (t) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const angleLerp = (a, b, t) => {
  let d = (((b - a) + 540) % 360) - 180;
  return a + d * t;
};
const mToMm = (m) => (m != null ? m * 1000 : 0);
const mmToM = (mm) => (mm != null ? mm / 1000 : 0);
const normDeg360 = (deg) => ((deg % 360) + 360) % 360;

/* ===== IK planar 2R (lo usas para 3R) ===== */
function ik2R(L1, L2, x, y, elbow = +1) {
  const rr = x * x + y * y;
  const c2 = clamp((rr - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const s2 = elbow * Math.sqrt(Math.max(0, 1 - c2 * c2));
  const qB = Math.atan2(s2, c2);
  const k1 = L1 + L2 * c2;
  const k2 = L2 * s2;
  const qA = Math.atan2(y, x) - Math.atan2(k2, k1);
  const ok = rr <= (L1 + L2) ** 2 && rr >= (L1 - L2) ** 2;
  return { qA, qB, ok };
}

/* ===== FK 3R ===== */
function fk3_pos({ L1, L2, q1, q2, q3 }) {
  const r = L1 * Math.cos(q2) + L2 * Math.cos(q2 + q3);
  const y = L1 * Math.sin(q2) + L2 * Math.sin(q2 + q3);
  const x = Math.sin(q1) * r; // q1=0 → +Z
  const z = Math.cos(q1) * r;
  return { x, y, z };
}

/* ===== FK polar ===== */
function fkPolar_pos({ theta, phi, rho }) {
  const radial = rho * Math.cos(phi);
  const y = rho * Math.sin(phi);
  const x = Math.sin(theta) * radial;
  const z = Math.cos(theta) * radial;
  return { x, y, z };
}

/* ================= Geometría ================= */
function LinkZ({ length = 0.3, color = 0x374151 }) {
  const geom = useMemo(
    () => new THREE.CylinderGeometry(0.018, 0.018, length, 20),
    [length]
  );
  const mat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        metalness: 0.3,
        roughness: 0.6,
      }),
    [color]
  );
  return (
    <mesh
      geometry={geom}
      material={mat}
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, 0, length / 2]}
    />
  );
}

function Joint({ r = 0.03 }) {
  return (
    <mesh>
      <sphereGeometry args={[r, 24, 24]} />
      <meshStandardMaterial color={0x111827} />
    </mesh>
  );
}

function Base() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[0.12, 0.12, 0.05, 32]} />
      <meshStandardMaterial color={0x6b7280} />
    </mesh>
  );
}

/* ===== Brazo 3R (tu vista) ===== */
function Arm3R({ L1, L2, q1, q2, q3 }) {
  return (
    <group>
      <Base />
      <group rotation={[0, q1, 0]}>{/* yaw */}
        <Joint />
        <group rotation={[-q2, 0, 0]}>{/* hombro pitch (invertido) */}
          <LinkZ length={L1} />
          <group position={[0, 0, L1]} rotation={[-q3, 0, 0]}>
            <Joint />
            <LinkZ length={L2} color={0x22c55e} />
            <mesh position={[0, 0, L2]}>
              <sphereGeometry args={[0.025, 24, 24]} />
              <meshStandardMaterial color={0x22c55e} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

/* ===== Brazo Polar ===== */
function ArmPolar({ theta, phi, rho, stub = 0.08 }) {
  return (
    <group>
      <Base />
      <group rotation={[0, theta, 0]}>{/* θ yaw */}
        <Joint />
        <group rotation={[-phi, 0, 0]}>{/* φ pitch (invertido para arriba) */}
          <LinkZ length={stub} />
          <group position={[0, 0, stub]}>
            <LinkZ length={rho} color={0x22c55e} />
            <mesh position={[0, 0, rho]}>
              <sphereGeometry args={[0.025, 24, 24]} />
              <meshStandardMaterial color={0x22c55e} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

function Ground() {
  const grid = useMemo(() => new THREE.GridHelper(6, 12, 0x555555, 0xe5e7eb), []);
  return <primitive object={grid} />;
}

function OrbitControls() {
  const { camera, gl } = useThree();
  const ref = useRef();
  useEffect(() => void ref.current?.update(), []);
  return (
    <orbitControls
      ref={ref}
      args={[camera, gl.domElement]}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.9}
      maxDistance={5}
      minDistance={0.4}
    />
  );
}

/* ===== Esfera objetivo ===== */
function Target({ target, onDrag }) {
  return (
    <mesh
      position={[target.x, target.y, target.z]}
      onPointerDown={(e) => e.stopPropagation()}
      onPointerMove={(e) => {
        if (e.buttons === 1) {
          onDrag?.(e.point.x, e.point.y, e.point.z);
        }
      }}
    >
      <sphereGeometry args={[0.035, 24, 24]} />
      <meshStandardMaterial color={0x2563eb} />
    </mesh>
  );
}

/* ================= App ================= */
export default function App() {
  // modo general
  const [mode, setMode] = useState("3d"); // '3d' o '2d'

  // tipo de robot dentro del 3D
  const [robotType, setRobotType] = useState("3R");

  // 3R: longitudes y articulaciones
  const [L1, setL1] = useState(0.35);
  const [L2, setL2] = useState(0.4);
  const [q1, setQ1] = useState(10);
  const [q2, setQ2] = useState(30);
  const [q3, setQ3] = useState(15);
  const [elbowPref, setElbowPref] = useState(+1);

  // POLAR
  const [theta, setTheta] = useState(10);
  const [phi, setPhi] = useState(25);
  const [rho, setRho] = useState(0.45);
  const [rhoMin, setRhoMin] = useState(0.05);
  const [rhoMax, setRhoMax] = useState(0.9);

  // NUEVO: estado para mostrar/ocultar guía
  const [showHelp, setShowHelp] = useState(false);

  // objetivo inicial según modo
  const pose3R0 = fk3_pos({ L1, L2, q1: rad(q1), q2: rad(q2), q3: rad(q3) });
  const posePolar0 = fkPolar_pos({ theta: rad(theta), phi: rad(phi), rho });
  const [target, setTarget] = useState(pose3R0);

  const rafRef = useRef(null);
  const [animating, setAnimating] = useState(false);

  /* ======== Solvers ======== */
  const solveIKReturn3R = (xt, yt, zt) => {
    const yclamp = Math.max(0, yt);
    const r = Math.hypot(xt, zt);
    const q1_yaw = Math.atan2(xt, zt);

    const cands = [];
    for (const e of [+1, -1]) {
      const { qA, qB, ok } = ik2R(L1, L2, r, yclamp, e);
      if (!ok) continue;
      const y_elbow = L1 * Math.sin(qA);
      const y_tip = y_elbow + L2 * Math.sin(qA + qB);
      if (y_elbow >= 0 && y_tip >= 0) {
        const cost = -y_elbow + (e === elbowPref ? 0 : 0.1);
        cands.push({
          type: "3R",
          q1: q1_yaw,
          q2: qA,
          q3: qB,
          y_elbow,
          y_tip,
          elbow: e,
          cost,
        });
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.cost - b.cost);
    return cands[0];
  };

  const solveIKReturnPolar = (xt, yt, zt) => {
    const yclamp = Math.max(0, yt);
    const r = Math.hypot(xt, zt);
    const s = Math.hypot(r, yclamp); // distancia total
    if (s < rhoMin || s > rhoMax) return null;
    const thetaYaw = Math.atan2(xt, zt);
    const phiPitch = Math.atan2(yclamp, r);
    const rhoReq = clamp(s, rhoMin, rhoMax);
    const y_tip = s * Math.sin(phiPitch);
    if (y_tip < 0) return null;
    return {
      type: "POLAR",
      theta: thetaYaw,
      phi: phiPitch,
      rho: rhoReq,
      y_tip,
      elbow: null,
    };
  };

  // función que aplica el IK elegido
  const solveIK = (xt, yt, zt) => {
    if (robotType === "3R") {
      const best = solveIKReturn3R(xt, yt, zt);
      if (!best) return false;
      const q1d = normDeg360(deg(best.q1));
      const q2d = clamp(deg(best.q2), 0, 180);
      const q3d = normDeg360(deg(best.q3));
      setQ1(q1d);
      setQ2(q2d);
      setQ3(q3d);
    } else {
      const sol = solveIKReturnPolar(xt, yt, zt);
      if (!sol) return false;
      setTheta(deg(sol.theta));
      setPhi(deg(sol.phi));
      setRho(sol.rho);
    }
    setTarget({ x: xt, y: Math.max(0, yt), z: zt });
    return true;
  };

  // para inputs
  const setTargetField = (field, val) =>
    setTarget((t) => ({
      ...t,
      [field]: field === "y" ? Math.max(0, val) : val,
    }));

  // animaciones existentes que ya tenías (no las toco)
  const animateToOpposite = (duration = 1) => {
    if (animating) return;
    const start = { ...target };
    const end = { x: -start.x, y: start.y, z: -start.z };
    setAnimating(true);
    const t0 = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / (duration * 1000));
      const e = easeInOutCubic(t);
      const x = lerp(start.x, end.x, e);
      const y = lerp(start.y, end.y, e);
      const z = lerp(start.z, end.z, e);
      setTarget({ x, y, z });
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else setAnimating(false);
    };
    rafRef.current = requestAnimationFrame(tick);
  };

  const animateJointsToOpposite = (duration = 1) => {
    if (animating) return;
    const startDeg = { q1, q2, q3 };
    const endP = { x: -target.x, y: target.y, z: -target.z };
    setAnimating(true);
    const t0 = performance.now();
    if (robotType === "3R") {
      const sol = solveIKReturn3R(endP.x, endP.y, endP.z);
      if (!sol) return;
      const endDeg = {
        q1: normDeg360(deg(sol.q1)),
        q2: clamp(deg(sol.q2), 0, 180),
        q3: normDeg360(deg(sol.q3)),
      };
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / (duration * 1000));
        const e = easeInOutCubic(t);
        const q1t = angleLerp(startDeg.q1, endDeg.q1, e);
        const q2t = angleLerp(startDeg.q2, endDeg.q2, e);
        const q3t = angleLerp(startDeg.q3, endDeg.q3, e);
        setQ1(normDeg360(q1t));
        setQ2(clamp(q2t, 0, 180));
        setQ3(normDeg360(q3t));
        const p = fk3_pos({
          L1,
          L2,
          q1: rad(q1t),
          q2: rad(q2t),
          q3: rad(q3t),
        });
        setTarget({ x: p.x, y: Math.max(0, p.y), z: p.z });
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
        else setAnimating(false);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      const sol = solveIKReturnPolar(endP.x, endP.y, endP.z);
      if (!sol) return;
      const startDeg2 = { th: theta, ph: phi };
      const endDeg2 = { th: deg(sol.theta), ph: deg(sol.phi) };
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / (duration * 1000));
        const e = easeInOutCubic(t);
        const th = lerp(startDeg2.th, endDeg2.th, e);
        const ph = lerp(startDeg2.ph, endDeg2.ph, e);
        const rhoL = lerp(rho, sol.rho, e);
        setTheta(th);
        setPhi(ph);
        setRho(rhoL);
        const p = fkPolar_pos({ theta: rad(th), phi: rad(ph), rho: rhoL });
        setTarget({ x: p.x, y: Math.max(0, p.y), z: p.z });
        if (t < 1) rafRef.current = requestAnimationFrame(tick);
        else setAnimating(false);
      };
      rafRef.current = requestAnimationFrame(tick);
    }
  };

  useEffect(
    () => () =>
      rafRef.current && cancelAnimationFrame(rafRef.current),
    []
  );

  /* ====== Estado del formulario de Cálculo IK ====== */
  const [calc, setCalc] = useState({
    x: target.x,
    y: target.y,
    z: target.z,
  });
  const [calcOut, setCalcOut] = useState(null);

  // 1) solo calcular
  const doCalc = () => {
    const res =
      robotType === "3R"
        ? solveIKReturn3R(calc.x, calc.y, calc.z)
        : solveIKReturnPolar(calc.x, calc.y, calc.z);

    if (!res) {
      setCalcOut({ ok: false });
      return;
    }

    if (robotType === "3R") {
      setCalcOut({
        ok: true,
        type: "3R",
        q1: normDeg360(deg(res.q1)),
        q2: clamp(deg(res.q2), 0, 180),
        q3: normDeg360(deg(res.q3)),
        elbow: res.elbow,
        y_elbow: res.y_elbow,
        y_tip: res.y_tip,
      });
    } else {
      setCalcOut({
        ok: true,
        type: "POLAR",
        theta: deg(res.theta),
        phi: deg(res.phi),
        rho: res.rho,
        y_tip: res.y_tip,
      });
    }
  };

  // 2) aplicar lo calculado
  const applyCalc = () => {
    if (!calcOut?.ok || animating) return;

    if (robotType === "3R") {
      setQ1(normDeg360(calcOut.q1));
      setQ2(clamp(calcOut.q2, 0, 180));
      setQ3(normDeg360(calcOut.q3));

      const p = fk3_pos({
        L1,
        L2,
        q1: rad(calcOut.q1),
        q2: rad(calcOut.q2),
        q3: rad(calcOut.q3),
      });
      setTarget({ x: p.x, y: Math.max(0, p.y), z: p.z });
    } else {
      setTheta(calcOut.theta);
      setPhi(calcOut.phi);
      setRho(calcOut.rho);

      const p = fkPolar_pos({
        theta: rad(calcOut.theta),
        phi: rad(calcOut.phi),
        rho: calcOut.rho,
      });
      setTarget({ x: p.x, y: Math.max(0, p.y), z: p.z });
    }
  };

  // sincronizar formulario con target
  useEffect(() => {
    setCalc({ x: target.x, y: target.y, z: target.z });
  }, [target.x, target.y, target.z]);

  // Cambiar tipo de robot 3D
  const toggleRobotType = () => {
    if (animating) return;
    if (robotType === "3R") {
      setRobotType("POLAR");
      const p = fkPolar_pos({ theta: rad(theta), phi: rad(phi), rho });
      setTarget({ x: p.x, y: Math.max(0, p.y), z: p.z });
    } else {
      setRobotType("3R");
      const p = fk3_pos({ L1, L2, q1: rad(q1), q2: rad(q2), q3: rad(q3) });
      setTarget({ x: p.x, y: Math.max(0, p.y), z: p.z });
    }
  };

  /* ==== modo 2D ==== */
  if (mode === "2d") {
    return <Robot2D onBack={() => setMode("3d")} />;
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f3f4f6", padding: 16 }}>
      {/* Header */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 8,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>
          Simulador — {robotType === "3R" ? "Brazo 3R" : "Robot Circular"}
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          {/* NUEVO: botón de guía */}
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
            onClick={toggleRobotType}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
            }}
            disabled={animating}
          >
            Cambiar a {robotType === "3R" ? "Robot Circular" : "Brazo 3R"}
          </button>
          <button
            onClick={() => setMode("2d")}
            style={{
              padding: "6px 10px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: "#fff",
            }}
          >
            Ir al robot 2D
          </button>
        </div>
      </header>

      {/* Layout principal */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr",
          gap: 16,
        }}
      >
        {/* Panel lateral */}
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            padding: 16,
            boxShadow: "0 1px 6px rgba(0,0,0,.06)",
          }}
        >
          {robotType === "3R" ? (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Longitudes (mm)</h2>
              {[
                ["L1", L1, setL1],
                ["L2", L2, setL2],
              ].map(([lbl, val, set]) => (
                <label
                  key={lbl}
                  style={{
                    display: "block",
                    fontSize: 12,
                    color: "#374151",
                    marginTop: 6,
                  }}
                >
                  {lbl}
                  <input
                    type="number"
                    step="1"
                    min="50"
                    max="1000"
                    value={Math.round(mToMm(val))}
                    onChange={(e) =>
                      !animating && set(mmToM(parseFloat(e.target.value)))
                    }
                    style={{
                      width: "100%",
                      padding: 6,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                    }}
                    disabled={animating}
                  />
                </label>
              ))}
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  marginTop: 10,
                }}
              >
                Articulaciones (°)
              </h2>
              {[
                ["q1 Rotación base ", q1, setQ1, 0, 360],
                ["q2 (hombro)", q2, setQ2, 0, 180],
                ["q3 (codo)", q3, setQ3, 0, 360],
              ].map(([lbl, val, set, mn, mx]) => (
                <div key={lbl} style={{ padding: "8px 0" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "#374151",
                    }}
                  >
                    <span>{lbl}</span>
                    <span style={{ fontFamily: "monospace" }}>
                      {normDeg360(val).toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={mn}
                    max={mx}
                    step={1}
                    value={val}
                    onChange={(e) => {
                      if (animating) return;
                      const next = parseFloat(e.target.value);
                      if (lbl.startsWith("q3")) {
                        const y =
                          L1 * Math.sin(rad(q2)) +
                          L2 * Math.sin(rad(q2) + rad(next));
                        if (y < 0) return;
                      }
                      set(next);
                    }}
                    style={{ width: "100%" }}
                    disabled={animating}
                  />
                </div>
              ))}
            </>
          ) : (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>
                Parámetros (Polar)
              </h2>
              <label
                style={{
                  display: "block",
                  fontSize: 12,
                  color: "#374151",
                  marginTop: 6,
                }}
              >
                ρ (extensión): {Math.round(mToMm(rho))} mm
                <input
                  type="range"
                  min={rhoMin}
                  max={rhoMax}
                  step={0.005}
                  value={rho}
                  onChange={(e) =>
                    !animating && setRho(parseFloat(e.target.value))
                  }
                  style={{ width: "100%" }}
                  disabled={animating}
                />
              </label>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(2,1fr)",
                  gap: 8,
                  marginTop: 6,
                }}
              >
                <label style={{ fontSize: 12, color: "#374151" }}>
                  ρ min
                  <input
                    type="number"
                    step={10}
                    value={mToMm(rhoMin)}
                    onChange={(e) =>
                      setRhoMin(mmToM(parseFloat(e.target.value)))
                    }
                    style={{
                      width: "100%",
                      padding: 6,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                    }}
                  />
                </label>
                <label style={{ fontSize: 12, color: "#374151" }}>
                  ρ max
                  <input
                    type="number"
                    step={10}
                    value={mToMm(rhoMax)}
                    onChange={(e) =>
                      setRhoMax(mmToM(parseFloat(e.target.value)))
                    }
                    style={{
                      width: "100%",
                      padding: 6,
                      border: "1px solid #ddd",
                      borderRadius: 8,
                    }}
                  />
                </label>
              </div>
              <h2
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  marginTop: 10,
                }}
              >
                Articulaciones (°)
              </h2>
              {[
                ["θ Rotación base (yaw)", theta, setTheta, -180, 180],
                ["φ (pitch)", phi, setPhi, 0, 90],
              ].map(([lbl, val, set, mn, mx]) => (
                <div key={lbl} style={{ padding: "8px 0" }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 12,
                      color: "#374151",
                    }}
                  >
                    <span>{lbl}</span>
                    <span style={{ fontFamily: "monospace" }}>
                      {normDeg360(val).toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={mn}
                    max={mx}
                    step={1}
                    value={val}
                    onChange={(e) =>
                      !animating && set(parseFloat(e.target.value))
                    }
                    style={{ width: "100%" }}
                    disabled={animating}
                  />
                </div>
              ))}
            </>
          )}

          {/* Objetivo */}
          <h2
            style={{
              fontSize: 16,
              fontWeight: 600,
              marginTop: 10,
            }}
          >
            Objetivo (coordenadas, mm)
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
              gap: 8,
            }}
          >
            {[
              ["x", target.x],
              ["y", target.y],
              ["z", target.z],
            ].map(([lbl, val]) => (
              <label key={lbl} style={{ fontSize: 12, color: "#374151" }}>
                {lbl}
                <input
                  type="number"
                  step="1"
                  value={Math.round(mToMm(val))}
                  onChange={(e) => {
                    if (animating) return;
                    const m = mmToM(parseFloat(e.target.value));
                    if (lbl === "y") {
                      setTargetField(lbl, Math.max(0, m));
                    } else {
                      setTargetField(lbl, m);
                    }
                  }}
                  style={{
                    width: "100%",
                    padding: 6,
                    border: "1px solid #ddd",
                    borderRadius: 8,
                  }}
                  disabled={animating}
                />
              </label>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              onClick={() => solveIK(target.x, target.y, target.z)}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
              }}
              disabled={animating}
            >
              Ir al objetivo
            </button>
            <button
              onClick={() => animateToOpposite(0.8)}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
              }}
              disabled={animating}
            >
              Animar objetivo al opuesto
            </button>
            <button
              onClick={() => animateJointsToOpposite(0.8)}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #ddd",
                background: "#fff",
              }}
              disabled={animating}
            >
              Animar juntas al opuesto
            </button>
          </div>
          <p style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>
            El IK falla si el objetivo es inalcanzable.
          </p>
        </div>

        {/* VISOR 3D */}
        <div
          style={{
            background: "#fff",
            borderRadius: 12,
            boxShadow: "0 1px 6px rgba(0,0,0,.06)",
            height: 560,
            overflow: "hidden",
          }}
        >
          <Canvas
            dpr={[1, 1.5]}
            gl={{ antialias: false, powerPreference: "high-performance" }}
            camera={{ position: [1.2, 0.9, 1.2], fov: 45 }}
          >
            <ambientLight intensity={0.6} />
            <directionalLight position={[2, 3, 2]} intensity={0.9} />
            <Ground />

            <group position={[0, 0.03, 0]}>
              {robotType === "3R" ? (
                <Arm3R
                  L1={L1}
                  L2={L2}
                  q1={rad(q1)}
                  q2={rad(q2)}
                  q3={rad(q3)}
                />
              ) : (
                <ArmPolar theta={rad(theta)} phi={rad(phi)} rho={rho} />
              )}
            </group>

            {/* Plano invisible para arrastrar en XZ */}
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0, 0]}
              onPointerMove={(e) => {
                if (e.buttons === 1 && !animating) {
                  const x = e.point.x;
                  const z = e.point.z;
                  const yy = Math.max(0, target.y);
                  setTarget({ x, y: yy, z });
                  solveIK(x, yy, z);
                }
              }}
            >
              <planeGeometry args={[6, 6]} />
              <meshBasicMaterial transparent opacity={0} />
            </mesh>

            <Target
              target={target}
              onDrag={(x, y, z) => {
                if (animating) return;
                const yy = Math.max(0, y);
                setTarget({ x, y: yy, z });
                solveIK(x, yy, z);
              }}
            />

            <OrbitControls />
          </Canvas>
        </div>
      </div>

      {/* ===== Cálculo IK numérico ===== */}
      <div
        style={{
          marginTop: 16,
          background: "#fff",
          borderRadius: 12,
          padding: 16,
          boxShadow: "0 1px 6px rgba(0,0,0,.06)",
        }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>
          Cálculo IK (vista numérica)
        </h2>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr) auto auto",
            gap: 8,
            alignItems: "end",
          }}
        >
          {["x", "y", "z"].map((k) => (
            <label key={k} style={{ fontSize: 12, color: "#374151" }}>
              {k}
              <input
                type="number"
                step="1"
                value={Math.round(mToMm(calc[k]))}
                onChange={(e) =>
                  setCalc((c) => ({
                    ...c,
                    [k]: mmToM(parseFloat(e.target.value)),
                  }))
                }
                style={{
                  width: "100%",
                  padding: 6,
                  border: "1px solid #ddd",
                  borderRadius: 8,
                }}
              />
            </label>
          ))}
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
            disabled={!calcOut?.ok || animating}
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              border: "1px solid #ddd",
              background: !calcOut?.ok || animating ? "#e5e7eb" : "#fff",
              height: 38,
              opacity: !calcOut?.ok || animating ? 0.5 : 1,
            }}
            title={
              !calcOut?.ok
                ? "Primero pulsa Calcular"
                : "Aplicar estos valores al robot"
            }
          >
            Aplicar
          </button>
        </div>

        {calcOut?.ok ? (
          robotType === "3R" ? (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 8,
                marginTop: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "#374151" }}>
                <div>
                  <b>q1 (yaw)</b>
                </div>
                <div style={{ fontFamily: "monospace" }}>
                  {normDeg360(calcOut.q1).toFixed(2)}°
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#374151" }}>
                <div>
                  <b>q2 (hombro)</b>
                </div>
                <div style={{ fontFamily: "monospace" }}>
                  {normDeg360(calcOut.q2).toFixed(2)}°
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#374151" }}>
                <div>
                  <b>q3 (codo)</b>
                </div>
                <div style={{ fontFamily: "monospace" }}>
                  {normDeg360(calcOut.q3).toFixed(2)}°
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#374151" }}>
                <div>
                  <b>config</b>
                </div>
                <div style={{ fontFamily: "monospace" }}>
                  {calcOut.elbow === +1 ? "arriba (+1)" : "abajo (-1)"}
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#374151" }}>
                <div>
                  <b>alturas</b>
                </div>
                <div style={{ fontFamily: "monospace" }}>
                  codo y={calcOut.y_elbow?.toFixed?.(3)} · punta y=
                  {calcOut.y_tip?.toFixed?.(3)}
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 8,
                marginTop: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "#374151" }}>
                <div>
                  <b>θ (yaw)</b>
                </div>
                <div style={{ fontFamily: "monospace" }}>
                  {calcOut.theta.toFixed(2)}°
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#374151" }}>
                <div>
                  <b>φ (elevación)</b>
                </div>
                <div style={{ fontFamily: "monospace" }}>
                  {calcOut.phi.toFixed(2)}°
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#374151" }}>
                <div>
                  <b>ρ (m)</b>
                </div>
                <div style={{ fontFamily: "monospace" }}>
                  {calcOut.rho.toFixed(3)} m
                </div>
              </div>
              <div style={{ fontSize: 12, color: "#374151" }}>
                <div>
                  <b>punta y</b>
                </div>
                <div style={{ fontFamily: "monospace" }}>
                  {calcOut.y_tip.toFixed(3)} m
                </div>
              </div>
            </div>
          )
        ) : calcOut && !calcOut.ok ? (
          <p style={{ marginTop: 12, color: "#b91c1c" }}>
            No hay solución válida para ese punto.
          </p>
        ) : null}
      </div>

      {/* ===== NUEVO: Modal de guía ===== */}
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
              maxWidth: 480,
              width: "90%",
              boxShadow: "0 10px 40px rgba(0,0,0,.25)",
              fontSize: 13,
              color: "#111827",
            }}
          >
            <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
              Guía rápida del simulador
            </h2>
            <p style={{ marginBottom: 8 }}>
              Esta app te permite explorar cinemática directa e inversa de dos
              tipos de robots:
            </p>
            <ul style={{ marginLeft: 16, marginBottom: 8 }}>
              <li>
                <b>Brazo 3R:</b> base giratoria (q1) + hombro (q2) + codo (q3).
              </li>
              <li>
                <b>Robot circular (polar):</b> ángulo de base (θ), elevación
                (φ) y extensión (ρ).
              </li>
            </ul>
            <p style={{ marginBottom: 8 }}>
              <b>Pasos sugeridos de uso:</b>
            </p>
            <ol style={{ marginLeft: 16, marginBottom: 8 }}>
              <li>
                Elige el tipo de robot con el botón{" "}
                <b>“Cambiar a Robot Circular / Brazo 3R”</b>.
              </li>
              <li>
                Ajusta las <b>longitudes</b> (L1, L2 o ρ) y las{" "}
                <b>articulaciones</b> con los deslizadores.
              </li>
              <li>
                Mueve la <b>esfera azul</b> o edita las coordenadas del
                objetivo (x, y, z) y pulsa <b>“Ir al objetivo”</b>.
              </li>
              <li>
                Usa el panel de <b>Cálculo IK</b> escribiendo un punto y
                pulsando <b>“Calcular”</b>; si la solución es válida puedes
                aplicarla con <b>“Aplicar”</b>.
              </li>
            </ol>

            <p style={{ marginBottom: 8 }}>
              <b>Actividad didáctica (cuestionario):</b>
            </p>
            <p style={{ marginBottom: 6 }}>
              Responde mentalmente (o por escrito) estas preguntas y usa el simulador
              para comprobar tus respuestas:
            </p>
            <ol style={{ marginLeft: 16, marginBottom: 10 }}>
              <li style={{ marginBottom: 6 }}>
                <b>Pregunta 1 (selección simple):</b>  
                ¿Cuál es una condición necesaria para que el algoritmo de cinemática
                inversa (IK) encuentre una solución para el objetivo?
                <br />
                a) Que el objetivo esté <b>dentro del alcance</b> del robot. <br />
                b) Que todas las articulaciones estén en 0°. <br />
                c) Que L1 y L2 sean exactamente iguales.
              </li>
              <li>
                <b>Pregunta 2 (selección simple):</b>  
                Si aumentas las longitudes L1 y L2 del brazo (manteniendo los mismos
                ángulos articulares), ¿qué ocurre con la región del espacio que puede
                alcanzar el efector final?
                <br />
                a) La región alcanzable se hace más grande. <br />
                b) La región alcanzable se hace más pequeña. <br />
                c) La región alcanzable no cambia.
              </li>
            </ol>
            <p style={{ marginBottom: 12 }}>
              Después de elegir tus respuestas, modifica las longitudes y mueve el
              objetivo en la escena 3D para verificar de forma visual si tus elecciones
              tienen sentido.
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
