import { useEffect, useMemo, useRef, useState } from "react";
import type { DeathInfo } from "../game/engine";
import { SKINS, SPECIES, skinToSpecies } from "../game/species";
import { spriteAnimPreviewCanvases } from "../game/sprites";
import type { JawState } from "../game/sprites";
import { fish3d } from "../game/fish3d";

interface Props {
  death: DeathInfo;
  prevBest: number;
  coinImg: string;
  onPlayAgain: () => void;
  onReturnMenu: () => void;
}

interface GradeSpec {
  grade: "S+" | "S" | "A" | "B" | "C" | "D";
  title: string;
  stars: number;
  ringColor: string;
  medalTop: string;
  medalBottom: string;
  letterColor: string;
  glow: string;
  bgTint: string;
}

const GRADES: GradeSpec[] = [
  {
    grade: "S+",
    title: "Penguasa Samudra",
    stars: 5,
    ringColor: "#fef08a",
    medalTop: "#fff7b2",
    medalBottom: "#f59e0b",
    letterColor: "#451a03",
    glow: "rgba(250, 204, 21, 0.65)",
    bgTint: "rgba(251, 191, 36, 0.14)",
  },
  {
    grade: "S",
    title: "Predator Legendaris",
    stars: 5,
    ringColor: "#fde047",
    medalTop: "#fde68a",
    medalBottom: "#d97706",
    letterColor: "#451a03",
    glow: "rgba(245, 158, 11, 0.52)",
    bgTint: "rgba(245, 158, 11, 0.12)",
  },
  {
    grade: "A",
    title: "Pemburu Terumbu",
    stars: 4,
    ringColor: "#6ee7b7",
    medalTop: "#a7f3d0",
    medalBottom: "#059669",
    letterColor: "#022c22",
    glow: "rgba(16, 185, 129, 0.45)",
    bgTint: "rgba(16, 185, 129, 0.10)",
  },
  {
    grade: "B",
    title: "Penjelajah Lincah",
    stars: 3,
    ringColor: "#7dd3fc",
    medalTop: "#bae6fd",
    medalBottom: "#0284c7",
    letterColor: "#082f49",
    glow: "rgba(56, 189, 248, 0.42)",
    bgTint: "rgba(56, 189, 248, 0.10)",
  },
  {
    grade: "C",
    title: "Penghuni Karang",
    stars: 2,
    ringColor: "#fdba74",
    medalTop: "#fed7aa",
    medalBottom: "#c2410c",
    letterColor: "#431407",
    glow: "rgba(249, 115, 22, 0.36)",
    bgTint: "rgba(249, 115, 22, 0.08)",
  },
  {
    grade: "D",
    title: "Ikan Pemula",
    stars: 1,
    ringColor: "#cbd5e1",
    medalTop: "#e2e8f0",
    medalBottom: "#64748b",
    letterColor: "#0f172a",
    glow: "rgba(148, 163, 184, 0.28)",
    bgTint: "rgba(148, 163, 184, 0.06)",
  },
];

const HERO_SWIM_CYCLE: JawState[] = [
  0, 0, 0, 0,
  1, 2, 4, 5, 6, 5, 3, 1,
  -1, -1, -1, -1,
  0, 0, 1, 3, 1, 0, 0, 0,
];

const KILLER_SWIM_CYCLE: JawState[] = [
  0, 0, 1, 3, 5, 6, 5, 3, 1, 0, 0, 0,
];

function drawCenteredFish(
  cv: HTMLCanvasElement | null,
  frame: HTMLCanvasElement | undefined,
  cssW: number,
  cssH: number,
  pad: number,
  bobY: number,
  tilt: number,
  flipX = false
) {
  if (!cv || !frame) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pw = Math.round(cssW * dpr);
  const ph = Math.round(cssH * dpr);
  if (cv.width !== pw || cv.height !== ph) {
    cv.width = pw;
    cv.height = ph;
  }
  const ctx = cv.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const fit = Math.min((cssW - pad * 2) / frame.width, (cssH - pad * 2) / frame.height);
  const dw = frame.width * fit;
  const dh = frame.height * fit;

  ctx.save();
  ctx.translate(cssW * 0.5, cssH * 0.5 + bobY);
  if (flipX) ctx.scale(-1, 1);
  ctx.rotate(tilt);
  ctx.drawImage(frame, -dw * 0.5, -dh * 0.5, dw, dh);
  ctx.restore();
}

function evaluateRun(death: DeathInfo, prevBest: number) {
  const huntPct = Math.min(100, Math.round((death.eaten / 85) * 70 + Math.min(30, death.botsEaten * 10)));
  const comboPct = Math.min(100, Math.round((death.maxCombo / 16) * 75 + Math.min(25, death.schoolSweeps * 12.5)));
  const explorePct = Math.min(100, Math.round((death.maxDepth / 6500) * 55 + ((death.stageNum - 1) / 4) * 45));
  const rankBonus = death.bestRank <= 1 ? 45 : death.bestRank <= 3 ? 36 : death.bestRank <= 10 ? 24 : 10;
  const survivePct = Math.min(100, Math.round((death.time / 120) * 55 + rankBonus));

  const scorePoints = Math.min(36, Math.round(Math.log10(Math.max(10, death.score + 10)) * 7.8));
  const totalRating = Math.min(
    100,
    Math.round(scorePoints + huntPct * 0.2 + comboPct * 0.16 + explorePct * 0.14 + survivePct * 0.14)
  );

  let spec = GRADES[5];
  if (totalRating >= 88 && death.score >= 12000) spec = GRADES[0];
  else if (totalRating >= 75) spec = GRADES[1];
  else if (totalRating >= 58) spec = GRADES[2];
  else if (totalRating >= 40) spec = GRADES[3];
  else if (totalRating >= 24) spec = GRADES[4];

  const isNewBest = death.score > prevBest && death.score > 0;

  const highlights: string[] = [];
  if (isNewBest) highlights.push("Rekor Skor Baru");
  if (death.peakLevelTime !== null) highlights.push(`Puncak Lv (${death.peakLevelTime}d)`);
  if (death.bestRank === 1) highlights.push("Juara #1");
  else if (death.bestRank <= 3) highlights.push(`Top #${death.bestRank}`);
  if (death.maxCombo >= 14) highlights.push(`Frenzy x${death.maxCombo}`);
  if (death.schoolSweeps >= 1) highlights.push(`Sapu Bersih x${death.schoolSweeps}`);
  if (death.maxDepth >= 5000) highlights.push("Palung Abisal");

  let tip = "Sedot kawanan ikan beruntun untuk menjaga rantai Kombo & hujan koin.";
  if (death.killerSpId === "bomb") {
    tip = "Jauhi Bom Ranjau berduri berkedip merah — ledakannya fatal dalam sekali sentuh.";
  } else if (death.bestRank > 10 && death.time < 45) {
    tip = "Gunakan Boost (Klik Kanan / Shift) untuk kabur saat tanda bahaya '!' muncul.";
  } else if (death.maxCombo < 10) {
    tip = "Incar kawanan ikan kecil & peti mutiara untuk memperpanjang rantai Frenzy.";
  }

  return {
    spec,
    totalRating,
    isNewBest,
    highlights: highlights.slice(0, 3),
    tip,
  };
}

function formatDuration(sec: number) {
  if (sec < 60) return `${sec} dtk`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toString().padStart(2, "0")}d`;
}

export default function GameOverModal({ death, prevBest, coinImg, onPlayAgain, onReturnMenu }: Props) {
  const evalData = useMemo(() => evaluateRun(death, prevBest), [death, prevBest]);
  const { spec } = evalData;

  const playerSpecies = useMemo(() => {
    const sk = SKINS.find((s) => s.id === death.playerSkinId) || SKINS[0];
    return skinToSpecies(sk, death.playerMode3D);
  }, [death.playerSkinId, death.playerMode3D]);

  const killedByBomb = death.killerSpId === "bomb";

  const killerSpecies = useMemo(() => {
    if (killedByBomb) return null;
    const sk = SKINS.find((s) => s.id === death.killerSpId);
    return sk ? skinToSpecies(sk) : SPECIES.find((s) => s.id === death.killerSpId) || SPECIES[SPECIES.length - 1];
  }, [death.killerSpId, killedByBomb]);

  const playerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const killerCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [displayScore, setDisplayScore] = useState(0);
  const [displayCoins, setDisplayCoins] = useState(0);

  // Smooth animated fish sprites (hero swim + killer chomp)
  useEffect(() => {
    const pFrames = playerSpecies.is3D
      ? HERO_SWIM_CYCLE.map((j, fi) => {
          const ph = (fi / HERO_SWIM_CYCLE.length) * Math.PI * 2;
          return fish3d.renderSnapshot(
            playerSpecies,
            {
              jaw: j > 0 ? j / 6 : j < 0 ? -0.18 : 0,
              chompPhase: j === -1 ? 0.08 : 0,
              chompDur: 0.13,
              chompBitFired: j === -1,
              biteLunge: j === -1 ? 1.5 : j >= 5 ? -0.5 : 0,
              tailPh: ph * 2,
              wag2: ph * 2,
              bend: Math.sin(ph) * 0.05,
              turnFlip: 1,
              tilt: Math.sin(ph) * 0.04,
              gulpT: j === -1 ? 0.65 : 0,
              gulpK: 0.65,
              sq: j === -1 ? 0.14 : 0,
              expr: j === -1 ? "happy" : "normal",
              puff: j === -1,
              sucking: false,
              swimSpeed: 0.55,
              inspectYaw: -0.18,
              inspectPitch: 0.04,
            },
            200
          );
        })
      : spriteAnimPreviewCanvases(playerSpecies, 240, HERO_SWIM_CYCLE);
    const kFrames = killerSpecies ? spriteAnimPreviewCanvases(killerSpecies, 128, KILLER_SWIM_CYCLE) : null;

    const reduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    drawCenteredFish(playerCanvasRef.current, pFrames[0], 216, 124, 10, 0, 0);
    if (kFrames) {
      drawCenteredFish(killerCanvasRef.current, kFrames[0], 56, 38, 4, 0, 0);
    }

    if (reduced) return;

    let alive = true;
    let raf = 0;
    const tick = (now: number) => {
      if (!alive) return;
      const step = Math.floor(now / 65);
      drawCenteredFish(
        playerCanvasRef.current,
        pFrames[step % pFrames.length],
        216,
        124,
        10,
        Math.sin(now * 0.0032) * 4.5,
        Math.sin(now * 0.0032 - 0.7) * 0.032
      );
      if (kFrames) {
        drawCenteredFish(
          killerCanvasRef.current,
          kFrames[step % kFrames.length],
          56,
          38,
          4,
          Math.sin(now * 0.0045 + 1.2) * 1.6,
          Math.sin(now * 0.0045) * 0.03
        );
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [playerSpecies, killerSpecies]);

  // Animated score & coin count-up
  useEffect(() => {
    const reduced =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setDisplayScore(death.score);
      setDisplayCoins(death.coins);
      return;
    }
    let raf = 0;
    const duration = 560;
    const t0 = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - t0) / duration);
      const ease = 1 - Math.pow(1 - u, 3);
      setDisplayScore(Math.round(death.score * ease));
      setDisplayCoins(Math.round(death.coins * ease));
      if (u < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [death.score, death.coins]);

  const bestScore = Math.max(prevBest, death.score);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gameover-title"
    >
      <div className="artistic-wood-board gameover-board-in relative w-full max-w-[740px] my-auto p-4 sm:p-5 flex flex-col gap-3.5">
        {/* Corner brass rivets */}
        <div className="absolute top-2.5 left-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
        <div className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
        <div className="absolute bottom-2.5 left-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
        <div className="absolute bottom-2.5 right-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>

        {/* Compact Top Header */}
        <div className="flex items-center justify-between gap-3 pb-2.5 border-b border-amber-200/15 px-1">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider uppercase text-amber-200/85">
              <span>Evaluasi Ronde</span>
              <span aria-hidden="true">·</span>
              <span className="text-white truncate">{death.playerName}</span>
            </div>
            <h2
              id="gameover-title"
              className="text-xl sm:text-[26px] font-extrabold text-white text-outline leading-tight truncate"
            >
              {spec.title}
            </h2>
          </div>

          <div className="flex items-center gap-2.5 ff-carved-slot px-3 py-1.5 shrink-0">
            <img src={coinImg} alt="Koin" className="w-6 h-6 shrink-0" />
            <div className="leading-none">
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-amber-200/75">Hadiah</div>
              <div className="text-[17px] font-extrabold text-yellow-300 tabular-nums mt-0.5">
                +{displayCoins.toLocaleString("en-US")}
              </div>
            </div>
          </div>
        </div>

        {/* Balanced 2-Column Body */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5 items-stretch">
          {/* LEFT: Compact Centered Animated Lagoon Showcase + Cause Strip */}
          <div className="md:col-span-5 flex flex-col gap-2.5">
            <div
              className="wood-lagoon-porthole relative px-3.5 pt-3 pb-3 flex-1 flex flex-col items-center justify-between overflow-hidden min-h-[205px]"
              style={{
                boxShadow: `inset 0 6px 22px rgba(0, 0, 0, 0.65), 0 0 22px ${spec.bgTint}`,
              }}
            >
              {/* Subtle rotating sunray halo behind the swimming fish */}
              <div
                className="sun-halo-spin pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[54%] w-52 h-52 rounded-full opacity-45"
                style={{
                  background:
                    "repeating-conic-gradient(from 0deg, rgba(165, 243, 252, 0.22) 0deg 10deg, transparent 10deg 26deg)",
                  WebkitMaskImage: "radial-gradient(circle, black 18%, transparent 70%)",
                  maskImage: "radial-gradient(circle, black 18%, transparent 70%)",
                }}
                aria-hidden="true"
              />

              {/* Top-left species tag & Top-right Grade Crest */}
              <div className="relative z-10 w-full flex items-start justify-between gap-2">
                <span className="text-[11px] font-extrabold text-cyan-100/90 text-outline tracking-wide">
                  {playerSpecies.name}
                </span>

                <div
                  className="gameover-medal-in relative w-14 h-14 flex items-center justify-center shrink-0 -mt-0.5 -mr-0.5"
                  style={{ filter: `drop-shadow(0 4px 10px ${spec.glow})` }}
                  aria-label={`Peringkat ${spec.grade}, skor penilaian ${evalData.totalRating} dari 100`}
                >
                  <svg viewBox="0 0 88 88" className="w-full h-full">
                    <defs>
                      <linearGradient id="goMedalGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={spec.medalTop} />
                        <stop offset="100%" stopColor={spec.medalBottom} />
                      </linearGradient>
                    </defs>
                    <polygon
                      points="44,3 54,13 68,10 73,23 85,30 81,44 85,58 73,65 68,78 54,75 44,85 34,75 20,78 15,65 3,58 7,44 3,30 15,23 20,10 34,13"
                      fill="url(#goMedalGrad)"
                      stroke="#2b1304"
                      strokeWidth="3"
                      strokeLinejoin="round"
                    />
                    <circle cx="44" cy="44" r="28" fill="none" stroke={spec.ringColor} strokeWidth="2.2" opacity="0.88" />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
                    <span
                      className="font-extrabold tracking-tight"
                      style={{
                        fontSize: spec.grade.length > 1 ? "20px" : "23px",
                        color: spec.letterColor,
                      }}
                    >
                      {spec.grade}
                    </span>
                    <span className="text-[8.5px] font-extrabold opacity-85 tabular-nums" style={{ color: spec.letterColor }}>
                      {evalData.totalRating}
                    </span>
                  </div>
                </div>
              </div>

              {/* Centered Live Animated Swimming Player Fish */}
              <div className="relative z-10 flex-1 w-full flex flex-col items-center justify-center -mt-3">
                <canvas
                  ref={playerCanvasRef}
                  aria-label={death.playerName}
                  className="w-[216px] h-[124px] block drop-shadow-[0_10px_14px_rgba(0,0,0,0.68)]"
                />
                <div
                  className="w-36 h-3 rounded-full bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent blur-[3px] -mt-2"
                  aria-hidden="true"
                />
              </div>

              {/* Bottom 5-Star Strip */}
              <div className="relative z-10 w-full flex items-center justify-center gap-1 pt-2 border-t border-cyan-200/20">
                <div className="flex items-center gap-1" aria-label={`Nilai ${spec.stars} dari 5 bintang`}>
                  {Array.from({ length: 5 }).map((_, i) => {
                    const lit = i < spec.stars;
                    return (
                      <svg
                        key={i}
                        viewBox="0 0 24 24"
                        className={`w-5 h-5 ${lit ? "gameover-star-in" : ""}`}
                        style={{ animationDelay: `${0.12 + i * 0.06}s` }}
                      >
                        <path
                          d="M12 2.4l2.9 5.9 6.5.9-4.7 4.6 1.1 6.4L12 17.1l-5.8 3.1 1.1-6.4L2.6 9.2l6.5-.9L12 2.4z"
                          fill={lit ? "#fde047" : "rgba(15, 23, 42, 0.55)"}
                          stroke={lit ? "#451a03" : "rgba(148, 163, 184, 0.35)"}
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                        />
                      </svg>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Compact Cause Strip with Animated Killer Fish */}
            <div className="artistic-inset px-3 py-2 flex items-center gap-2.5">
              <div className="w-[58px] h-[40px] rounded-lg bg-[#0a1d3a] border border-rose-400/35 flex items-center justify-center shrink-0 overflow-hidden">
                {killedByBomb ? (
                  <svg viewBox="0 0 40 40" className="w-8 h-8 drop-shadow-[0_0_6px_rgba(248,113,113,0.6)]">
                    <g stroke="#64748b" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="20" y1="3" x2="20" y2="37" />
                      <line x1="3" y1="20" x2="37" y2="20" />
                      <line x1="8" y1="8" x2="32" y2="32" />
                      <line x1="32" y1="8" x2="8" y2="32" />
                    </g>
                    <circle cx="20" cy="20" r="11" fill="#334155" stroke="#0f172a" strokeWidth="2" />
                    <circle cx="20" cy="19" r="3.2" fill="#ef4444" />
                    <circle cx="20" cy="19" r="1.4" fill="#fef08a" />
                  </svg>
                ) : (
                  <canvas
                    ref={killerCanvasRef}
                    aria-label={death.killer}
                    className="w-[56px] h-[38px] block"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1 leading-tight">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-rose-300">
                  Akhir Ronde
                </div>
                <div className="text-[13.5px] font-extrabold text-white truncate mt-0.5">
                  {killedByBomb ? "Terkena Ranjau Laut" : `Dimakan ${death.killer}`}
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: Essential Hero Score + 4 Key Metrics + Highlights & Tip */}
          <div className="md:col-span-7 flex flex-col justify-between gap-2.5">
            {/* Hero Score Banner */}
            <div className="artistic-inset relative overflow-hidden p-3.5 flex items-center justify-between gap-3">
              {evalData.isNewBest && <span className="pointer-events-none absolute inset-0 ui-sheen" aria-hidden="true" />}
              <div className="relative z-10">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-amber-200/80">
                  <span>Skor Akhir</span>
                  {evalData.isNewBest && (
                    <span className="text-yellow-300 font-extrabold">★ Rekor Baru!</span>
                  )}
                </div>
                <div className="text-[36px] sm:text-[42px] font-extrabold text-yellow-300 text-outline tabular-nums leading-none mt-1">
                  {displayScore.toLocaleString("en-US")}
                </div>
              </div>

              <div className="relative z-10 text-right shrink-0">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-200/75">
                  Rekor Terbaik
                </div>
                <div className="text-[19px] font-extrabold text-amber-50 tabular-nums mt-0.5">
                  {bestScore.toLocaleString("en-US")}
                </div>
              </div>
            </div>

            {/* 4 Essential Key Stats (2x2 clean, spacious, zero truncation) */}
            <div className="grid grid-cols-2 gap-2.5 flex-1">
              <div className="ff-carved-slot px-3.5 py-2.5 flex flex-col justify-center">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-200/75">
                  Mangsa Dimakan
                </div>
                <div className="text-[20px] font-extrabold text-white tabular-nums leading-tight mt-0.5">
                  {death.eaten}
                  {death.botsEaten > 0 && (
                    <span className="text-[12px] font-bold text-emerald-300 ml-1.5">
                      +{death.botsEaten} rival
                    </span>
                  )}
                </div>
              </div>

              <div className="ff-carved-slot px-3.5 py-2.5 flex flex-col justify-center">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-200/75">
                  Kombo Puncak
                </div>
                <div className="text-[20px] font-extrabold text-yellow-300 tabular-nums leading-tight mt-0.5">
                  x{death.maxCombo}
                </div>
              </div>

              <div className="ff-carved-slot px-3.5 py-2.5 flex flex-col justify-center">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-200/75">
                  Peringkat &amp; Tahap
                </div>
                <div className="text-[18px] font-extrabold text-emerald-300 tabular-nums leading-tight mt-0.5">
                  #{death.bestRank}
                  <span className="text-[13px] font-bold text-amber-100/85 ml-1.5">
                    · Tahap {death.stageNum}
                  </span>
                </div>
              </div>

              <div className="ff-carved-slot px-3.5 py-2.5 flex flex-col justify-center">
                <div className="text-[10.5px] font-bold uppercase tracking-wider text-amber-200/75">
                  Durasi &amp; Kedalaman
                </div>
                <div className="text-[18px] font-extrabold text-cyan-200 tabular-nums leading-tight mt-0.5">
                  {formatDuration(death.time)}
                  <span className="text-[13px] font-bold text-sky-100/85 ml-1.5">
                    · {death.maxDepth} m
                  </span>
                </div>
              </div>
            </div>

            {/* Concise Highlights + 1-Line Tactical Tip */}
            <div className="artistic-inset px-3.5 py-2.5 flex flex-col gap-1">
              {evalData.highlights.length > 0 && (
                <div className="text-[12px] font-extrabold text-cyan-200 truncate">
                  {evalData.highlights.join(" · ")}
                </div>
              )}
              <div className="text-[12px] text-amber-100/90 leading-snug">
                <span className="font-extrabold text-yellow-300">Tips: </span>
                {evalData.tip}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Action Row */}
        <div className="flex flex-col-reverse sm:flex-row gap-2.5 pt-0.5">
          <button
            type="button"
            onClick={onReturnMenu}
            className="ui-btn px-5 py-2.5 min-h-[46px] text-[14.5px] text-amber-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200"
            style={{ background: "linear-gradient(180deg, #8c5b2f 0%, #5c3614 100%)" }}
          >
            MENU &amp; TOKO KOIN
          </button>

          <button
            type="button"
            onClick={onPlayAgain}
            className="ui-btn ui-sheen relative overflow-hidden flex-1 px-6 py-2.5 min-h-[46px] text-[17.5px] text-white tracking-wide whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200"
            style={{ background: "linear-gradient(180deg, #4be880 0%, #1ba248 100%)" }}
          >
            <span className="relative drop-shadow-[0_2px_3px_rgba(0,0,0,0.6)]">▶ MAIN LAGI SEKARANG</span>
          </button>
        </div>
      </div>
    </div>
  );
}
