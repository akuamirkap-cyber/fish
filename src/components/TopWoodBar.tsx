import { useEffect, useRef } from "react";
import { SPECIES } from "../game/species";
import type { HudState } from "../game/engine";

interface Props {
  hud: HudState | null;
  icons: string[];
  coinImg: string;
  coinBump: number;
  onMenu: () => void;
  onCoinBoxPos?: (x: number, y: number) => void;
}

const FRENZY_CHARS = ["F", "R", "E", "N", "Z", "Y", "!"];

export default function TopWoodBar({ hud, icons, coinImg, coinBump, onMenu, onCoinBoxPos }: Props) {
  const coinBoxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const updatePos = () => {
      if (!coinBoxRef.current || !onCoinBoxPos) return;
      const rect = coinBoxRef.current.getBoundingClientRect();
      if (rect.width > 0) {
        onCoinBoxPos(rect.left + rect.width / 2, rect.top + rect.height / 2);
      }
    };
    updatePos();
    window.addEventListener("resize", updatePos);
    return () => window.removeEventListener("resize", updatePos);
  });

  // Show 4 food-chain fish icons like the Feeding Frenzy wooden bar:
  // up to 3 currently edible fish + the next locked larger fish with the yellow "!" warning triangle!
  const lv = hud?.level ?? 2;
  const startIdx = Math.max(0, Math.min(SPECIES.length - 4, lv - 3));
  const shownSpecies = SPECIES.slice(startIdx, startIdx + 4);

  const growthPct = Math.round((hud?.growthPct ?? 0) * 100);
  // Ability bar reflects active ability energy (suction or boost), matching the bright yellow ABILITY bar
  const abilityVal = hud?.boosting ? hud.boost : hud?.sucking ? hud.energy : Math.min(hud?.energy ?? 1, hud?.boost ?? 1);
  const abilityPct = Math.round(abilityVal * 100);
  const isTired = !!(hud?.exhausted || hud?.boostExhausted);

  const frenzyLit = hud?.frenzyStage ?? 0;
  const fullFrenzy = (hud?.combo ?? 0) >= 7;
  const formattedScore = (hud?.score ?? 0).toLocaleString("en-US");

  return (
    <div className="absolute inset-x-0 top-0 z-20 select-none pointer-events-none">
      {/* Main Driftwood Plank Header */}
      <div className="relative w-full h-[76px] sm:h-[82px] pointer-events-auto drop-shadow-[0_5px_8px_rgba(0,0,0,0.6)]">
        {/* Rich SVG Wood Grain Plank Background with Organic Carved Bottom Edge */}
        <svg
          viewBox="0 0 1280 90"
          preserveAspectRatio="none"
          className="absolute inset-0 w-full h-full pointer-events-none"
        >
          <defs>
            <linearGradient id="woodBase" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#cfa06e" />
              <stop offset="10%" stopColor="#bc8a57" />
              <stop offset="58%" stopColor="#a67342" />
              <stop offset="90%" stopColor="#8c5b2f" />
              <stop offset="100%" stopColor="#6b411e" />
            </linearGradient>
            <linearGradient id="recessGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#241307" />
              <stop offset="65%" stopColor="#38200e" />
              <stop offset="100%" stopColor="#472a14" />
            </linearGradient>
          </defs>

          {/* Outer jagged driftwood plank silhouette */}
          <path
            d="M0,0 L1280,0 L1280,82 Q1230,86 1180,81 Q1115,85 1040,80 Q960,85 885,81 Q805,86 735,81 Q640,87 550,81 Q465,86 380,80 Q290,85 205,81 Q110,86 45,81 L0,83 Z"
            fill="url(#woodBase)"
            stroke="#2b1506"
            strokeWidth="3"
          />

          {/* Top sunlit bevel highlight */}
          <path d="M0,3 L1280,3" stroke="#e8c396" strokeWidth="2.5" opacity="0.65" />

          {/* Natural horizontal wood grain streaks & knots */}
          <g fill="none" stroke="#784922" strokeWidth="1.6" opacity="0.38">
            <path d="M0,16 Q180,12 370,18 T760,15 T1120,19 L1280,16" />
            <path d="M0,31 Q220,36 440,29 T890,34 T1280,29" />
            <path d="M0,48 Q160,43 350,50 T780,46 T1160,51 L1280,48" />
            <path d="M0,65 Q240,70 490,63 T940,68 T1280,64" />
            <ellipse cx="320" cy="46" rx="22" ry="4.5" opacity="0.55" />
            <ellipse cx="980" cy="24" rx="26" ry="4" opacity="0.5" />
          </g>
          <g fill="none" stroke="#deb483" strokeWidth="1.2" opacity="0.28">
            <path d="M0,22 Q210,19 420,24 T860,21 T1280,24" />
            <path d="M0,56 Q260,60 510,54 T990,59 T1280,55" />
          </g>
        </svg>

        {/* Plank Content Grid matching Image 3 100% */}
        <div className="relative z-10 max-w-[1220px] mx-auto h-[74px] sm:h-[78px] px-2.5 sm:px-5 flex items-center justify-between gap-2 sm:gap-4">
          {/* ============ LEFT SECTION: MENU + FISH ICONS & GROWTH + 3-SEGMENT BAR ============ */}
          <div className="flex flex-col justify-center gap-1 flex-1 min-w-0">
            {/* Top Row: MENU + 4 Prey Icons */}
            <div className="flex items-center gap-2 sm:gap-3 h-[34px]">
              <button
                onClick={onMenu}
                className="ff-label text-[16px] sm:text-[21px] leading-none cursor-pointer hover:scale-105 active:scale-95 transition-transform shrink-0"
                title="Kembali ke Menu & Toko"
              >
                MENU
              </button>

              <div className="flex items-center gap-1.5 sm:gap-3 overflow-hidden">
                {shownSpecies.map((sp) => {
                  const globalIdx = SPECIES.indexOf(sp);
                  const edible = lv > globalIdx;
                  return (
                    <div key={sp.id} className="relative flex items-center justify-center h-[30px] px-0.5" title={sp.name}>
                      <img
                        src={icons[globalIdx]}
                        alt={sp.name}
                        className="h-[25px] sm:h-[30px] w-auto object-contain transition-all"
                        style={{
                          filter: edible
                            ? "drop-shadow(0 2px 2px rgba(0,0,0,0.55))"
                            : "brightness(0.22) sepia(0.6) hue-rotate(55deg) saturate(1.8) drop-shadow(0 1px 1px rgba(0,0,0,0.6))",
                        }}
                      />
                      {/* Iconic yellow warning triangle "!" on next dangerous/locked fish just like FF2! */}
                      {!edible && (
                        <svg
                          viewBox="0 0 24 22"
                          className="absolute -right-1 bottom-0 w-3.5 h-3.5 sm:w-4 sm:h-4 drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]"
                        >
                          <polygon points="12,1 23,21 1,21" fill="#ffe629" stroke="#2b1604" strokeWidth="2.2" strokeLinejoin="round" />
                          <rect x="10.7" y="7" width="2.6" height="7" rx="1.2" fill="#1c0f04" />
                          <circle cx="12" cy="17.3" r="1.5" fill="#1c0f04" />
                        </svg>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Bottom Row: GROWTH + 3-Segment Yellow Bar */}
            <div className="flex items-center gap-2 sm:gap-3 h-[24px]">
              <span className="ff-label text-[14px] sm:text-[19px] leading-none shrink-0">GROWTH</span>
              <div className="ff-bar-slot relative flex-1 max-w-[235px] h-[14px] sm:h-[16px] overflow-hidden">
                <div
                  className="ff-yellow-fill h-full transition-all duration-150"
                  style={{ width: `${growthPct}%` }}
                />
                {/* 2 Carved Segment Notches dividing bar into 3 stages just like Image 3 */}
                <div className="absolute inset-y-0 left-1/3 w-[2.5px] bg-[#2b1708]/85 shadow-[1px_0_0_rgba(255,255,255,0.25)]" />
                <div className="absolute inset-y-0 left-2/3 w-[2.5px] bg-[#2b1708]/85 shadow-[1px_0_0_rgba(255,255,255,0.25)]" />
              </div>
            </div>
          </div>

          {/* ============ CENTER SECTION: CARVED DARK WOOD "Fish.io • FRENZY!" PLAQUE ============ */}
          <div className="ff-carved-slot ui-sheen relative overflow-hidden px-3 sm:px-5 py-1 sm:py-1.5 flex flex-col items-center justify-center shrink-0 min-w-[148px] sm:min-w-[225px] h-[54px] sm:h-[60px]">
            <div className="text-[9.5px] sm:text-[11px] font-extrabold tracking-widest uppercase text-cyan-300 drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] flex items-center gap-1 leading-none -mb-0.5">
              <span>🐠</span>
              <span className="fish-title-shine">Fish.io</span>
              <span className="text-yellow-400">★</span>
            </div>
            <div className={`flex items-center tracking-tight ${fullFrenzy ? "frenzy-pulse" : ""}`} style={{ transform: "skewX(-7deg)" }}>
              {FRENZY_CHARS.map((ch, idx) => {
                const lit = idx < frenzyLit;
                return (
                  <span
                    key={idx}
                    className="font-extrabold text-[26px] sm:text-[38px] leading-none transition-all duration-150"
                    style={{
                      backgroundImage: fullFrenzy
                        ? "linear-gradient(180deg, #fff9a6 0%, #ffd426 50%, #ff7b1c 100%)"
                        : lit
                          ? "linear-gradient(180deg, #fff599 0%, #ffd026 60%, #e8890c 100%)"
                          : "linear-gradient(180deg, #dbe9f7 0%, #9cb3cc 55%, #758ca6 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      color: "transparent",
                      filter:
                        "drop-shadow(-2px -2px 0 #180d05) drop-shadow(2px -2px 0 #180d05) drop-shadow(-2px 2px 0 #180d05) drop-shadow(2px 2px 0 #180d05) drop-shadow(0 3px 2px rgba(0,0,0,0.75))",
                    }}
                  >
                    {ch}
                  </span>
                );
              })}
            </div>
          </div>

          {/* ============ RIGHT SECTION: SCORE + CARVED SLOTS & ABILITY + FISH x STAGE ============ */}
          <div className="flex flex-col justify-center gap-1 flex-1 min-w-0 items-end">
            {/* Top Row: SCORE + Dark Carved Score Box + Dark Carved Coin Box */}
            <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 w-full h-[34px]">
              <span className="ff-label text-[15px] sm:text-[20px] leading-none shrink-0">SCORE</span>

              {/* Carved Score Box (right-aligned cream-gold numbers with commas!) */}
              <div className="ff-carved-slot px-2.5 sm:px-3.5 h-[28px] sm:h-[31px] min-w-[96px] sm:min-w-[155px] flex items-center justify-end">
                <span
                  className="font-bold text-[16px] sm:text-[23px] leading-none tracking-wide"
                  style={{
                    color: "#fff3b0",
                    textShadow: "-1.5px -1.5px 0 #1c0e04, 1.5px -1.5px 0 #1c0e04, -1.5px 1.5px 0 #1c0e04, 1.5px 1.5px 0 #1c0e04, 0 2px 2px rgba(0,0,0,0.8)",
                  }}
                >
                  {formattedScore}
                </span>
              </div>

              {/* Rightmost Carved Box (Coin Counter Target!) */}
              <div
                ref={coinBoxRef}
                className="ff-carved-slot px-2 sm:px-2.5 h-[28px] sm:h-[31px] min-w-[54px] sm:min-w-[68px] flex items-center justify-center gap-1 shrink-0"
                title="Koin yang dikumpulkan"
              >
                <img key={coinBump} src={coinImg} alt="coin" className="w-4 h-4 sm:w-5 sm:h-5 pop shrink-0" />
                <span
                  key={"cn" + coinBump}
                  className="pop font-bold text-[13px] sm:text-[16px] leading-none text-yellow-200"
                  style={{ textShadow: "0 1.5px 2px #000" }}
                >
                  {hud?.coins ?? 0}
                </span>
              </div>
            </div>

            {/* Bottom Row: ABILITY + Yellow Bar + Orange Fish Icon "x" + Stage Box */}
            <div className="flex items-center justify-end gap-1.5 sm:gap-2.5 w-full h-[24px]">
              <span className={`ff-label text-[14px] sm:text-[19px] leading-none shrink-0 ${isTired ? "blink" : ""}`}>
                ABILITY
              </span>

              {/* Carved Ability Yellow Bar (shows Suction & Boost energy) */}
              <div
                className="ff-bar-slot relative flex-1 max-w-[138px] h-[14px] sm:h-[16px] overflow-hidden"
                title="Klik Kiri: Sedot | Klik Kanan: Boost"
              >
                <div
                  className="h-full transition-all duration-100"
                  style={{
                    width: `${abilityPct}%`,
                    background: isTired
                      ? "linear-gradient(180deg, #ff7a7a, #e03131)"
                      : "linear-gradient(180deg, #fbff54 0%, #e5eb1e 55%, #b8c20e 100%)",
                    boxShadow: "inset 0 1.5px 0 rgba(255,255,255,0.7)",
                  }}
                />
                {/* Thin subtle secondary indicator along bottom edge so both Suction & Boost remain visible */}
                <div
                  className="absolute bottom-0 left-0 h-[2.5px] bg-cyan-300/85 transition-all duration-100"
                  style={{ width: `${Math.round((hud?.energy ?? 1) * 100)}%` }}
                />
              </div>

              {/* Tiny Orange Fish Silhouette + "x" + Carved Number Slot just like Image 3! */}
              <div className="flex items-center gap-1 shrink-0" title="Tahap Ukuran Ikan">
                <svg viewBox="0 0 26 16" className="w-4 h-3 sm:w-5 sm:h-3.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.85)]">
                  <path
                    d="M6,8 L1,3 L2.5,8 L1,13 Z M5,8 C8,2 18,2 24,8 C18,14 8,14 5,8 Z"
                    fill="#ff8c1a"
                    stroke="#2b1304"
                    strokeWidth="1.8"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="text-[12px] sm:text-[14px] font-extrabold text-white drop-shadow-[0_1.5px_1px_#000]">x</span>
                <div className="ff-carved-slot px-2 h-[22px] min-w-[28px] sm:min-w-[34px] flex items-center justify-center">
                  <span className="font-bold text-[13px] sm:text-[15px] text-white leading-none drop-shadow-[0_1.5px_1px_#000]">
                    {hud?.stageNum ?? 1}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Subtle translucent sub-caption right below center of wood plank (updates with Sunlit Reef vs Deep Cavern!) */}
      <div className="text-center mt-0.5">
        <span
          className="text-[12px] sm:text-[14px] font-semibold text-white/85 tracking-wide"
          style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.75)" }}
        >
          {hud?.zoneName || "Teluk Karang Tropis"} • Peringkat #{hud?.rank || "-"} dari {hud?.total || "-"} Pemain
        </span>
      </div>
    </div>
  );
}
