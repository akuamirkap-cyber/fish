import { useEffect, useMemo, useRef, useState } from "react";
import GameOverModal from "./components/GameOverModal";
import Menu, { coinURL } from "./components/Menu";
import TopWoodBar from "./components/TopWoodBar";
import TrophyModal from "./components/TrophyModal";
import { sfx } from "./game/audio";
import { Game } from "./game/engine";
import type { DeathInfo, HudState } from "./game/engine";
import { depthMeters } from "./game/ocean";
import { SKINS, SPECIES } from "./game/species";
import { spriteDataURL } from "./game/sprites";
import { loadSave, writeSave } from "./save";
import type { SaveData } from "./save";
import { evaluateUnlocks, formatSecShort } from "./trophies";

type Screen = "menu" | "play";

interface Banner {
  id: number;
  title: string;
  text: string;
  tone: "gold" | "cyan" | "green";
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);

  const [save, setSaveState] = useState<SaveData>(() => loadSave());
  const saveRef = useRef(save);
  saveRef.current = save;

  const [screen, setScreen] = useState<Screen>("menu");
  const screenRef = useRef<Screen>(screen);
  screenRef.current = screen;

  const [ready, setReady] = useState(false);
  const [loadPct, setLoadPct] = useState(0);
  const [hud, setHud] = useState<HudState | null>(null);
  const [death, setDeath] = useState<DeathInfo | null>(null);
  const [prevBest, setPrevBest] = useState(0);
  const [coinBump, setCoinBump] = useState(0);
  const [muted, setMuted] = useState(false);
  const [pixelMode, setPixelMode] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [feedMsg, setFeedMsg] = useState<string | null>(null);
  const [showTrophies, setShowTrophies] = useState(false);
  const [hasEnteredPlay, setHasEnteredPlay] = useState(false);
  const showTrophiesRef = useRef(showTrophies);
  showTrophiesRef.current = showTrophies;

  const runTrackRef = useRef({
    rank1Recorded: false,
    peakRecorded: false,
    endedRecorded: false,
  });

  const speciesIcons = useMemo(
    () => (hasEnteredPlay ? SPECIES.map((sp) => spriteDataURL(sp, 92, 0)) : []),
    [hasEnteredPlay]
  );
  const coinImg = useMemo(() => coinURL(), []);

  const updateSave = (next: SaveData) => {
    setSaveState(next);
    writeSave(next);
    gameRef.current?.setSpeedScale(next.speedPref, next.upgrades.speed);
    gameRef.current?.setReef3D(next.reef3D);
  };

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const g = new Game(cv, { reef3D: saveRef.current.reef3D, pixelMode: false });
    gameRef.current = g;
    g.speedScale = saveRef.current.speedPref;

    let bannerTimer: number | undefined;
    let feedTimer: number | undefined;
    let seq = 1;

    g.onLoad = (pct, isReady) => {
      setLoadPct(pct);
      if (isReady) setReady(true);
    };

    g.onHud = (h) => {
      setHud(h);
    };

    g.onDeath = (info) => {
      const cur = saveRef.current;
      setPrevBest(cur.best);
      setDeath(info);
      if (!runTrackRef.current.endedRecorded) {
        runTrackRef.current.endedRecorded = true;
        const addRank1 = info.reachedRank1 && !runTrackRef.current.rank1Recorded ? 1 : 0;
        if (addRank1) runTrackRef.current.rank1Recorded = true;
        const addPeak = info.peakLevelTime !== null && !runTrackRef.current.peakRecorded ? 1 : 0;
        let nextBestTime = cur.bestPeakTimeSec;
        if (info.peakLevelTime !== null && !runTrackRef.current.peakRecorded) {
          runTrackRef.current.peakRecorded = true;
          nextBestTime = nextBestTime === null ? info.peakLevelTime : Math.min(nextBestTime, info.peakLevelTime);
        }
        const draft: SaveData = {
          ...cur,
          coins: cur.coins + info.coins,
          best: Math.max(cur.best, info.score),
          rank1Count: cur.rank1Count + addRank1,
          peakLevelCount: cur.peakLevelCount + addPeak,
          bestPeakTimeSec: nextBestTime,
          bestCombo: Math.max(cur.bestCombo, info.maxCombo),
          bestDepth: Math.max(cur.bestDepth, info.maxDepth),
          totalRuns: cur.totalRuns + 1,
        };
        const { nextUnlocked } = evaluateUnlocks(draft);
        const updated: SaveData = { ...draft, unlockedTrophies: nextUnlocked };
        setSaveState(updated);
        writeSave(updated);
      }
    };

    g.onEvent = (ev) => {
      if (ev.type === "coinbump") {
        setCoinBump((c) => c + 1);
      } else if (ev.type === "frenzy") {
        clearTimeout(bannerTimer);
        setBanner({ id: seq++, title: "FRENZY!", text: `Combo x${ev.n} beruntun!`, tone: "gold" });
        bannerTimer = window.setTimeout(() => setBanner(null), 2100);
      } else if (ev.type === "levelup") {
        clearTimeout(bannerTimer);
        setBanner({ id: seq++, title: "NAIK UKURAN!", text: ev.text, tone: "cyan" });
        bannerTimer = window.setTimeout(() => setBanner(null), 2400);
      } else if (ev.type === "bonus") {
        clearTimeout(bannerTimer);
        setBanner({ id: seq++, title: ev.title, text: ev.text, tone: "green" });
        bannerTimer = window.setTimeout(() => setBanner(null), 2400);
      } else if (ev.type === "feed") {
        clearTimeout(feedTimer);
        setFeedMsg(ev.text);
        feedTimer = window.setTimeout(() => setFeedMsg(null), 2600);
      } else if (ev.type === "rank1") {
        if (!runTrackRef.current.rank1Recorded) {
          runTrackRef.current.rank1Recorded = true;
          const cur = saveRef.current;
          const draft: SaveData = {
            ...cur,
            rank1Count: cur.rank1Count + 1,
          };
          const { nextUnlocked, newlyUnlocked } = evaluateUnlocks(draft);
          const updated: SaveData = { ...draft, unlockedTrophies: nextUnlocked };
          setSaveState(updated);
          writeSave(updated);

          clearTimeout(bannerTimer);
          if (newlyUnlocked.length > 0) {
            const top = newlyUnlocked[newlyUnlocked.length - 1];
            setBanner({
              id: seq++,
              title: `PIAGAM BARU: ${top.name.toUpperCase()}!`,
              text: `Julukan «${top.titleReward}» terbuka (${updated.rank1Count}× Juara #1)`,
              tone: "gold",
            });
          } else {
            setBanner({
              id: seq++,
              title: "PERINGKAT #1!",
              text: `Penguasa lautan saat ini · ${updated.rank1Count}× Juara #1`,
              tone: "gold",
            });
          }
          bannerTimer = window.setTimeout(() => setBanner(null), 2800);
        }
      } else if (ev.type === "peaklevel") {
        if (!runTrackRef.current.peakRecorded) {
          runTrackRef.current.peakRecorded = true;
          const cur = saveRef.current;
          const prevTime = cur.bestPeakTimeSec;
          const nextBestTime = prevTime === null ? ev.timeSec : Math.min(prevTime, ev.timeSec);
          const draft: SaveData = {
            ...cur,
            peakLevelCount: cur.peakLevelCount + 1,
            bestPeakTimeSec: nextBestTime,
          };
          const { nextUnlocked, newlyUnlocked } = evaluateUnlocks(draft);
          const updated: SaveData = { ...draft, unlockedTrophies: nextUnlocked };
          setSaveState(updated);
          writeSave(updated);

          clearTimeout(bannerTimer);
          if (newlyUnlocked.length > 0) {
            const top = newlyUnlocked[newlyUnlocked.length - 1];
            setBanner({
              id: seq++,
              title: `PIAGAM PUNCAK: ${top.name.toUpperCase()}!`,
              text: `Capai Puncak Level dalam ${formatSecShort(ev.timeSec)} · Julukan «${top.titleReward}»`,
              tone: "gold",
            });
          } else {
            setBanner({
              id: seq++,
              title: "PUNCAK LEVEL!",
              text: `Predator tertinggi tercapai dalam ${formatSecShort(ev.timeSec)}!`,
              tone: "cyan",
            });
          }
          bannerTimer = window.setTimeout(() => setBanner(null), 2800);
        }
      }
    };

    const onResize = () => g.resize(false);
    window.addEventListener("resize", onResize);

    return () => {
      clearTimeout(bannerTimer);
      clearTimeout(feedTimer);
      window.removeEventListener("resize", onResize);
      g.destroy();
      gameRef.current = null;
    };
  }, []);

  // Attach minimap canvas reference & toggle menu attract-mode throttling
  useEffect(() => {
    if (gameRef.current) {
      gameRef.current.minimap = screen === "play" ? minimapRef.current : null;
      gameRef.current.setMenuMode(screen === "menu");
      gameRef.current.setMenuPaused(screen === "menu" && showTrophies);
    }
  }, [screen, hud?.alive, showTrophies]);

  // Input listeners while playing
  useEffect(() => {
    const g = gameRef.current;
    if (!g) return;

    const onMouseMove = (e: MouseEvent) => {
      g.mouse.x = e.clientX;
      g.mouse.y = e.clientY;
      g.mouse.active = true;
    };

    const onMouseDown = (e: MouseEvent) => {
      sfx.init();
      if (screenRef.current !== "play") return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest("button, input, a")) return;
      if (e.button === 0) g.setSuck(true);
      else if (e.button === 2) g.setBoost(true);
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) g.setSuck(false);
      else if (e.button === 2) g.setBoost(false);
    };

    const onContextMenu = (e: MouseEvent) => {
      if (screenRef.current === "play") e.preventDefault();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (screenRef.current !== "play" || !e.touches[0]) return;
      g.mouse.x = e.touches[0].clientX;
      g.mouse.y = e.touches[0].clientY;
      g.mouse.active = true;
    };

    const onTouchStart = (e: TouchEvent) => {
      sfx.init();
      if (screenRef.current !== "play" || !e.touches[0]) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest("button, input, a")) return;
      g.mouse.x = e.touches[0].clientX;
      g.mouse.y = e.touches[0].clientY;
      g.mouse.active = true;
      if (e.touches.length >= 2) g.setBoost(true);
      else g.setSuck(true);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length === 0) {
        g.setSuck(false);
        g.setBoost(false);
      } else if (e.touches.length === 1) {
        g.setBoost(false);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (screenRef.current === "menu") {
        if (e.key === "Escape" && showTrophiesRef.current) {
          setShowTrophies(false);
        }
        return;
      }
      if (screenRef.current !== "play") return;
      if (e.code === "Space") {
        e.preventDefault();
        g.setSuck(true);
      } else if (e.key === "Shift") {
        g.setBoost(true);
      } else if (e.key === "Escape") {
        handleReturnMenu();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") g.setSuck(false);
      else if (e.key === "Shift") g.setBoost(false);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("contextmenu", onContextMenu);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("contextmenu", onContextMenu);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  const handlePlay = (skinIdOverride?: string) => {
    sfx.init();
    const g = gameRef.current;
    if (!g || !ready) return;
    const chosenId = typeof skinIdOverride === "string" ? skinIdOverride : save.skin;
    if (chosenId !== save.skin) {
      updateSave({ ...save, skin: chosenId });
    }
    const skin = SKINS.find((s) => s.id === chosenId) || SKINS[0];
    const playSkin = { ...skin, is3D: !!(save.mode3D && skin.supports3D) };
    runTrackRef.current = { rank1Recorded: false, peakRecorded: false, endedRecorded: false };
    setHasEnteredPlay(true);
    setShowTrophies(false);
    setDeath(null);
    setBanner(null);
    g.setMenuMode(false);
    setScreen("play");
    g.start({
      name: save.name.trim() || "Kamu",
      skin: playSkin,
      upgrades: save.upgrades,
      speedScale: save.speedPref,
    });
  };

  const handleReturnMenu = () => {
    const g = gameRef.current;
    if (g) {
      g.setSuck(false);
      g.setBoost(false);
      if (g.player && !g.player.dead && !runTrackRef.current.endedRecorded) {
        runTrackRef.current.endedRecorded = true;
        const cur = saveRef.current;
        const addRank1 = g.reachedRank1 && !runTrackRef.current.rank1Recorded ? 1 : 0;
        const addPeak = g.peakLevelTime !== null && !runTrackRef.current.peakRecorded ? 1 : 0;
        let nextBestTime = cur.bestPeakTimeSec;
        if (g.peakLevelTime !== null && !runTrackRef.current.peakRecorded) {
          nextBestTime = nextBestTime === null ? g.peakLevelTime : Math.min(nextBestTime, g.peakLevelTime);
        }
        const draft: SaveData = {
          ...cur,
          coins: cur.coins + g.sessionCoins,
          best: Math.max(cur.best, g.arcadeScore),
          rank1Count: cur.rank1Count + addRank1,
          peakLevelCount: cur.peakLevelCount + addPeak,
          bestPeakTimeSec: nextBestTime,
          bestCombo: Math.max(cur.bestCombo, g.maxCombo),
          bestDepth: Math.max(cur.bestDepth, depthMeters(g.maxDepthY)),
          totalRuns: cur.totalRuns + 1,
        };
        const { nextUnlocked } = evaluateUnlocks(draft);
        const updated: SaveData = { ...draft, unlockedTrophies: nextUnlocked };
        setSaveState(updated);
        writeSave(updated);
        g.player.dead = true;
      }
    }
    setDeath(null);
    setScreen("menu");
  };

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    sfx.setMuted(next);
  };

  const togglePixel = () => {
    const next = !pixelMode;
    setPixelMode(next);
    gameRef.current?.setPixelMode(next);
  };

  const toggleReef3D = () => {
    const nextReef3D = !save.reef3D;
    updateSave({ ...save, reef3D: nextReef3D });
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#06183b]">
      <canvas ref={canvasRef} className="block w-full h-full cursor-crosshair" />

      {screen === "menu" && (
        <Menu
          save={save}
          setSave={updateSave}
          onPlay={handlePlay}
          onOpenTrophies={() => setShowTrophies(true)}
          loading={!ready}
          loadPct={loadPct}
          paused={showTrophies}
        />
      )}

      {screen === "menu" && showTrophies && (
        <TrophyModal
          save={save}
          onEquipTitle={(title) => updateSave({ ...save, equippedTitle: title })}
          onClose={() => setShowTrophies(false)}
        />
      )}

      {screen === "play" && (
        <>
          <TopWoodBar
            hud={hud}
            icons={speciesIcons}
            coinImg={coinImg}
            coinBump={coinBump}
            onMenu={handleReturnMenu}
            onCoinBoxPos={(x, y) => {
              if (gameRef.current) gameRef.current.coinHudPos = { x, y };
            }}
          />

          {/* Active Power-Up Timers (only visible while active) */}
          {hud && (hud.shieldT > 0 || hud.turboT > 0 || hud.vortexT > 0) && (
            <div className="fixed top-[88px] left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 pointer-events-none">
              {hud.shieldT > 0 && (
                <div className="px-2.5 py-1 rounded-lg bg-emerald-950/80 border border-emerald-400/70 text-emerald-200 text-xs font-extrabold shadow-lg flex items-center gap-1.5">
                  <span>🛡️</span>
                  <span>Perisai {Math.ceil(hud.shieldT)}d</span>
                </div>
              )}
              {hud.turboT > 0 && (
                <div className="px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-300/70 text-cyan-100 text-xs font-extrabold shadow-lg flex items-center gap-1.5">
                  <span>⚡</span>
                  <span>Turbo {Math.ceil(hud.turboT)}d</span>
                </div>
              )}
              {hud.vortexT > 0 && (
                <div className="px-2.5 py-1 rounded-lg bg-amber-950/80 border border-amber-300/70 text-amber-200 text-xs font-extrabold shadow-lg flex items-center gap-1.5">
                  <span>🌀</span>
                  <span>Mega Hisap {Math.ceil(hud.vortexT)}d</span>
                </div>
              )}
            </div>
          )}

          {/* Top-right floating leaderboard + audio/pixel controls */}
          <div className="fixed top-[92px] right-3 z-20 flex flex-col items-end gap-2 pointer-events-none">
            <div className="pointer-events-auto flex items-center gap-1.5 flex-wrap justify-end">
              <button
                onClick={toggleMute}
                className="px-2.5 py-1 rounded-lg bg-[#241307]/85 border border-[#a67342]/70 text-xs font-bold text-amber-100 hover:bg-[#3a200e] cursor-pointer shadow"
                title={muted ? "Nyalakan Suara" : "Bisukan Suara"}
              >
                {muted ? "🔇 Suara Mati" : "🔊 Suara"}
              </button>
              {!pixelMode && (
                <button
                  onClick={toggleReef3D}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer shadow transition-colors ${
                    save.reef3D
                      ? "bg-[#0c3954]/90 border-cyan-300/75 text-cyan-100 hover:bg-[#144f73]"
                      : "bg-[#241307]/85 border-[#a67342]/70 text-amber-100 hover:bg-[#3a200e]"
                  }`}
                  title="Ganti karang & batuan besar antara 3D (Default) dan 2D"
                >
                  {save.reef3D ? "🪨 Karang 3D" : "🪸 Karang 2D"}
                </button>
              )}
              <button
                onClick={togglePixel}
                className="px-2.5 py-1 rounded-lg bg-[#241307]/85 border border-[#a67342]/70 text-xs font-bold text-amber-100 hover:bg-[#3a200e] cursor-pointer shadow"
                title="Ganti gaya gambar HD / Pixel"
              >
                {pixelMode ? "👾 Pixel" : "✨ HD"}
              </button>
            </div>

            {hud?.leaderboard && hud.leaderboard.length > 0 && (
              <div className="w-44 sm:w-52 rounded-xl bg-slate-950/60 backdrop-blur-sm border border-white/15 px-3 py-2 text-xs shadow-lg">
                <div className="font-extrabold text-yellow-300 tracking-wide uppercase text-[11px] mb-1">
                  Peringkat Lautan
                </div>
                <div className="flex flex-col gap-0.5">
                  {hud.leaderboard.map((row, idx) => (
                    <div
                      key={idx}
                      className={`flex items-center justify-between gap-2 ${row.me ? "text-yellow-300 font-extrabold" : "text-sky-100/90"}`}
                    >
                      <span className="truncate">
                        {idx + 1}. {row.name}
                      </span>
                      <span className="tabular-nums shrink-0">{row.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Minimap bottom-right */}
          <div className="fixed bottom-3 right-3 z-20 pointer-events-none rounded-lg overflow-hidden border-2 border-[#a67342]/85 shadow-xl bg-slate-950/70">
            <canvas ref={minimapRef} width={156} height={82} className="block" />
          </div>

          {/* Combo / Level-up / Bonus Banner */}
          {banner && (
            <div className="fixed top-[126px] left-1/2 -translate-x-1/2 z-30 pointer-events-none text-center px-5 py-2 rounded-2xl bg-slate-950/75 backdrop-blur-sm border-2 border-yellow-300/70 shadow-2xl">
              <div
                className={`font-extrabold text-xl sm:text-2xl tracking-wide ${
                  banner.tone === "gold" ? "text-yellow-300" : banner.tone === "green" ? "text-emerald-300" : "text-cyan-300"
                }`}
              >
                {banner.title}
              </div>
              <div className="text-xs sm:text-sm font-bold text-white">{banner.text}</div>
            </div>
          )}

          {/* Live kill feed toast */}
          {feedMsg && (
            <div className="fixed bottom-3 left-3 z-20 pointer-events-none px-3 py-1.5 rounded-lg bg-slate-950/65 border border-white/15 text-xs font-semibold text-sky-100">
              {feedMsg}
            </div>
          )}

          {/* Game Over Evaluation Modal */}
          {death && (
            <GameOverModal
              death={death}
              prevBest={prevBest}
              coinImg={coinImg}
              onPlayAgain={() => handlePlay()}
              onReturnMenu={handleReturnMenu}
            />
          )}
        </>
      )}
    </div>
  );
}
