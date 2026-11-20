import { useMemo, useState } from "react";
import type { SaveData } from "../save";
import {
  RARITY_META,
  TROPHIES,
  formatSecShort,
  getTrophyProgress,
  isTrophyMet,
} from "../trophies";
import type { TrophyCategory, TrophyEmblem, TrophySpec } from "../trophies";

interface Props {
  save: SaveData;
  onEquipTitle: (title: string | null) => void;
  onClose: () => void;
}

type FilterTab = "all" | TrophyCategory;

function PlaqueEmblem({
  emblem,
  accent,
  sealTop,
  sealBot,
  size = 86,
  locked = false,
}: {
  emblem: TrophyEmblem;
  accent: string;
  sealTop: string;
  sealBot: string;
  size?: number;
  locked?: boolean;
}) {
  const uid = useMemo(() => `${emblem}-${Math.random().toString(36).slice(2, 7)}`, [emblem]);
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={locked ? "opacity-55 grayscale-[0.45]" : "drop-shadow-[0_6px_14px_rgba(0,0,0,0.65)]"}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={`g-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={sealTop} />
          <stop offset="100%" stopColor={sealBot} />
        </linearGradient>
        <radialGradient id={`halo-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={accent} stopOpacity="0.45" />
          <stop offset="70%" stopColor={accent} stopOpacity="0.08" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft aura behind emblem */}
      <circle cx="50" cy="50" r="46" fill={`url(#halo-${uid})`} />

      {/* Sea-laurel wreath */}
      <g fill="none" stroke={`url(#g-${uid})`} strokeWidth="2.4" strokeLinecap="round" opacity="0.88">
        <path d="M24,72 C13,58 13,38 24,24" />
        <path d="M76,72 C87,58 87,38 76,24" />
        <path d="M18,58 L12,53 M16,46 L10,41 M19,34 L14,28" />
        <path d="M82,58 L88,53 M84,46 L90,41 M81,34 L86,28" />
      </g>

      {/* Outer ornamental shield ring */}
      <circle cx="50" cy="50" r="30" fill="rgba(4,12,28,0.75)" stroke={`url(#g-${uid})`} strokeWidth="3" />
      <circle cx="50" cy="50" r="24" fill="none" stroke={accent} strokeWidth="0.9" strokeDasharray="3 3" opacity="0.65" />

      {emblem === "crown" && (
        <g>
          <path
            d="M29,62 L26,40 L39,49 L50,31 L61,49 L74,40 L71,62 Z"
            fill={`url(#g-${uid})`}
            stroke="#1e0b02"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <rect x="29" y="62" width="42" height="6" rx="2.5" fill={accent} stroke="#1e0b02" strokeWidth="1.8" />
          <circle cx="50" cy="30" r="3" fill="#fffbeb" />
          <circle cx="26" cy="39" r="2.3" fill="#fffbeb" />
          <circle cx="74" cy="39" r="2.3" fill="#fffbeb" />
        </g>
      )}

      {emblem === "trident" && (
        <g>
          <path
            d="M50,22 L50,74 M36,30 C36,42 42,46 50,46 C58,46 64,42 64,30"
            fill="none"
            stroke={`url(#g-${uid})`}
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <polygon points="50,18 45,28 55,28" fill="#fffbeb" />
          <polygon points="36,24 32,33 40,33" fill={accent} />
          <polygon points="64,24 60,33 68,33" fill={accent} />
          <path d="M32,63 Q41,58 50,63 T68,63" fill="none" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {emblem === "crown50" && (
        <g>
          <path
            d="M27,54 L25,35 L38,44 L50,24 L62,44 L75,35 L73,54 Z"
            fill={`url(#g-${uid})`}
            stroke="#1e0b02"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="23" r="3.4" fill="#fef9c3" />
          <rect x="27" y="54" width="46" height="17" rx="6" fill="#1e0b36" stroke={accent} strokeWidth="2.2" />
          <text
            x="50"
            y="66.5"
            textAnchor="middle"
            fontSize="13.5"
            fontWeight="900"
            fill="#fef08a"
            fontFamily="Fredoka, system-ui, sans-serif"
          >
            50×
          </text>
        </g>
      )}

      {emblem === "leviathan" && (
        <g>
          <path
            d="M50,22 L50,75 M33,31 C33,44 41,49 50,49 C59,49 67,44 67,31"
            fill="none"
            stroke={`url(#g-${uid})`}
            strokeWidth="4"
            strokeLinecap="round"
          />
          <polygon points="50,16 44,27 56,27" fill="#fef9c3" />
          <path d="M27,52 L22,40 L31,45 L36,36 L39,49 Z" fill={accent} stroke="#082f49" strokeWidth="1.4" />
          <path d="M73,52 L78,40 L69,45 L64,36 L61,49 Z" fill={accent} stroke="#082f49" strokeWidth="1.4" />
          <rect x="29" y="57" width="42" height="15" rx="5.5" fill="#081b44" stroke={accent} strokeWidth="2" />
          <text
            x="50"
            y="68"
            textAnchor="middle"
            fontSize="12"
            fontWeight="900"
            fill="#fef08a"
            fontFamily="Fredoka, system-ui, sans-serif"
          >
            100×
          </text>
        </g>
      )}

      {emblem === "evo" && (
        <g>
          <path d="M31,58 C38,44 52,36 67,36" fill="none" stroke={accent} strokeWidth="2.5" strokeDasharray="3 3" />
          <path d="M30,62 C33,57 41,57 44,62 C41,67 33,67 30,62 Z" fill={sealTop} />
          <path d="M44,50 C48,43 58,43 62,50 C58,57 48,57 44,50 Z" fill={accent} />
          <path
            d="M52,35 C58,27 71,27 76,35 C71,43 58,43 52,35 Z"
            fill={`url(#g-${uid})`}
            stroke="#0f172a"
            strokeWidth="1.6"
          />
          <polygon points="54,35 48,30 48,40" fill={`url(#g-${uid})`} />
        </g>
      )}

      {emblem === "chrono" && (
        <g>
          <rect x="45" y="21" width="10" height="6" rx="2" fill={accent} stroke="#1e0b02" strokeWidth="1.5" />
          <circle cx="50" cy="52" r="20" fill="#08162b" stroke={`url(#g-${uid})`} strokeWidth="3.5" />
          <circle cx="50" cy="52" r="14" fill="none" stroke={accent} strokeWidth="1" opacity="0.55" />
          <line x1="50" y1="52" x2="50" y2="41" stroke="#fef08a" strokeWidth="2.8" strokeLinecap="round" />
          <line x1="50" y1="52" x2="60" y2="55" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="50" cy="52" r="2.6" fill="#fffbeb" />
        </g>
      )}

      {emblem === "lightning" && (
        <g>
          <polygon
            points="54,24 38,52 49,52 44,75 64,45 52,45"
            fill={`url(#g-${uid})`}
            stroke="#1e0b02"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M30,45 L24,38 M70,56 L76,62" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      )}

      {emblem === "supernova" && (
        <g>
          <polygon
            points="50,18 55,41 78,34 60,50 78,66 55,59 50,82 45,59 22,66 40,50 22,34 45,41"
            fill={`url(#g-${uid})`}
            stroke="#082f49"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <circle cx="50" cy="50" r="8.5" fill="#fef9c3" stroke="#082f49" strokeWidth="1.5" />
        </g>
      )}

      {emblem === "chest" && (
        <g>
          <path d="M30,46 C30,36 70,36 70,46 Z" fill={`url(#g-${uid})`} stroke="#2b1405" strokeWidth="2" />
          <rect x="29" y="46" width="42" height="22" rx="3" fill="#7c3e14" stroke="#2b1405" strokeWidth="2" />
          <rect x="46" y="44" width="8" height="10" rx="2" fill="#fde047" stroke="#2b1405" strokeWidth="1.5" />
          <circle cx="40" cy="43" r="3" fill="#fef08a" />
          <circle cx="50" cy="41" r="3.4" fill="#fde047" />
          <circle cx="60" cy="43" r="3" fill="#fef08a" />
        </g>
      )}

      {emblem === "vortex" && (
        <g fill="none" strokeLinecap="round">
          <path d="M50,27 C65,27 72,39 69,52 C66,65 51,71 39,65 C28,59 26,44 35,36 C43,29 56,33 58,43 C60,52 51,58 45,53" stroke={`url(#g-${uid})`} strokeWidth="4" />
          <circle cx="50" cy="49" r="4" fill={accent} />
        </g>
      )}

      {emblem === "abyss" && (
        <g>
          <path d="M36,68 L41,35 L59,35 L64,68 Z" fill="#1e293b" stroke={`url(#g-${uid})`} strokeWidth="2.4" strokeLinejoin="round" />
          <circle cx="50" cy="50" r="8" fill={accent} />
          <circle cx="50" cy="50" r="4" fill="#fffbeb" />
          <path d="M44,35 C44,27 56,27 56,35" fill="none" stroke={accent} strokeWidth="2.5" />
        </g>
      )}
    </svg>
  );
}

function CornerFiligree({ color, className }: { color: string; className: string }) {
  return (
    <svg viewBox="0 0 36 36" className={className} aria-hidden="true">
      <path
        d="M3,30 C3,14 14,3 30,3 M3,20 C7,10 10,7 20,3 M7,25 C10,16 16,10 25,7"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.72"
      />
      <circle cx="6" cy="6" r="2.6" fill={color} />
    </svg>
  );
}

export default function TrophyModal({ save, onEquipTitle, onClose }: Props) {
  const [filter, setFilter] = useState<FilterTab>("all");

  const defaultSelected = useMemo(() => {
    const unlockedList = TROPHIES.filter((t) => !!save.unlockedTrophies[t.id] || isTrophyMet(t, save));
    if (unlockedList.length > 0) return unlockedList[unlockedList.length - 1].id;
    return "rank1_50";
  }, [save]);

  const [selectedId, setSelectedId] = useState<string>(defaultSelected);

  const unlockedCount = useMemo(
    () => TROPHIES.filter((t) => !!save.unlockedTrophies[t.id] || isTrophyMet(t, save)).length,
    [save]
  );

  const filtered = useMemo(
    () => (filter === "all" ? TROPHIES : TROPHIES.filter((t) => t.category === filter)),
    [filter]
  );

  const selected: TrophySpec = useMemo(
    () => TROPHIES.find((t) => t.id === selectedId) || TROPHIES[0],
    [selectedId]
  );

  const selRarity = RARITY_META[selected.rarity];
  const selUnlocked = !!save.unlockedTrophies[selected.id] || isTrophyMet(selected, save);
  const selProg = getTrophyProgress(selected, save);
  const selEquipped = save.equippedTitle === selected.titleReward;
  const playerName = save.name.trim() || "Kamu";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-3 sm:p-5 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="trophy-gallery-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="artistic-wood-board gameover-board-in relative w-full max-w-[1060px] my-auto p-4 sm:p-6 flex flex-col gap-4">
        {/* Corner brass rivets */}
        <div className="absolute top-2.5 left-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
        <div className="absolute top-2.5 right-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
        <div className="absolute bottom-2.5 left-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>
        <div className="absolute bottom-2.5 right-2.5 w-3 h-3 rounded-full bg-[#e3ab4b] border border-[#3b1d06] shadow-sm flex items-center justify-center text-[7px] text-[#4d2808]">✕</div>

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-amber-200/15 px-1">
          <div>
            <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-amber-300">
              Galeri Kehormatan &amp; Julukan Samudra
            </div>
            <h2 id="trophy-gallery-title" className="text-2xl sm:text-[30px] font-extrabold text-white text-outline leading-tight">
              Koleksi Piagam Prestasi ({unlockedCount}/{TROPHIES.length})
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="ff-carved-slot px-3.5 py-1.5 text-left">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200/75">Juara #1</div>
              <div className="text-[15px] font-extrabold text-yellow-300 tabular-nums">{save.rank1Count}×</div>
            </div>
            <div className="ff-carved-slot px-3.5 py-1.5 text-left">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200/75">Puncak Tercepat</div>
              <div className="text-[15px] font-extrabold text-cyan-200 tabular-nums">
                {save.bestPeakTimeSec !== null ? formatSecShort(save.bestPeakTimeSec) : "Belum"}
              </div>
            </div>
            <div className="ff-carved-slot px-3.5 py-1.5 text-left max-w-[200px]">
              <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200/75">Julukan Aktif</div>
              <div className="text-[14px] font-extrabold text-emerald-300 truncate">
                {save.equippedTitle ? `« ${save.equippedTitle} »` : "Belum Dipasang"}
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="ui-btn px-4 py-2 min-h-[42px] text-[14px] text-amber-100 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200"
              style={{ background: "linear-gradient(180deg, #8c5b2f 0%, #5c3614 100%)" }}
            >
              ✕ Tutup
            </button>
          </div>
        </div>

        {/* Main 2-column showcase: Ornate Plaque Preview (Left) + Collectible Wall (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* LEFT: CEREMONIAL ORNATE PLAQUE INSPECTOR */}
          <div className="lg:col-span-5 flex flex-col">
            <div
              className="relative rounded-[20px] p-[4px] flex-1 flex flex-col shadow-[0_14px_34px_rgba(0,0,0,0.72)]"
              style={{
                background: selRarity.frameGrad,
                boxShadow: `0 14px 32px rgba(0,0,0,0.7), 0 0 28px ${selUnlocked ? selRarity.glow : "rgba(0,0,0,0)"}`,
              }}
            >
              <div
                className="relative rounded-[16px] flex-1 p-5 flex flex-col items-center justify-between text-center overflow-hidden border border-white/15"
                style={{ background: selRarity.plateBg }}
              >
                {/* Intricate nautical compass & guilloche watermark */}
                <svg
                  viewBox="0 0 240 240"
                  className="pointer-events-none absolute inset-0 m-auto w-[230px] h-[230px] opacity-[0.09]"
                  aria-hidden="true"
                >
                  <circle cx="120" cy="120" r="106" fill="none" stroke={selRarity.accentCol} strokeWidth="1.2" strokeDasharray="4 4" />
                  <circle cx="120" cy="120" r="82" fill="none" stroke={selRarity.accentCol} strokeWidth="1" />
                  <circle cx="120" cy="120" r="54" fill="none" stroke={selRarity.accentCol} strokeWidth="0.9" />
                  <polygon points="120,10 128,112 230,120 128,128 120,230 112,128 10,120 112,112" fill="none" stroke={selRarity.accentCol} strokeWidth="1" />
                </svg>

                {/* Animated sheen when unlocked */}
                {selUnlocked && <span className="pointer-events-none absolute inset-0 ui-sheen" aria-hidden="true" />}

                {/* Four baroque nautical corner filigree */}
                <CornerFiligree color={selRarity.borderCol} className="pointer-events-none absolute top-2 left-2 w-8 h-8" />
                <CornerFiligree color={selRarity.borderCol} className="pointer-events-none absolute top-2 right-2 w-8 h-8 -scale-x-100" />
                <CornerFiligree color={selRarity.borderCol} className="pointer-events-none absolute bottom-2 left-2 w-8 h-8 -scale-y-100" />
                <CornerFiligree color={selRarity.borderCol} className="pointer-events-none absolute bottom-2 right-2 w-8 h-8 -scale-x-100 -scale-y-100" />

                {/* Top Engraving */}
                <div className="relative z-10 w-full flex flex-col items-center gap-1 pt-1">
                  <div className="text-[10px] font-extrabold uppercase tracking-[0.26em] opacity-85" style={{ color: selRarity.accentCol }}>
                    Piagam Kehormatan Samudra
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-white/80">
                    <span>Tingkat {selRarity.label}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{selected.badgeTag}</span>
                  </div>
                </div>

                {/* Center Emblem + Recipient + Folded Julukan Scroll */}
                <div className="relative z-10 flex flex-col items-center gap-2.5 my-2">
                  <PlaqueEmblem
                    emblem={selected.emblem}
                    accent={selRarity.accentCol}
                    sealTop={selRarity.sealTop}
                    sealBot={selRarity.sealBot}
                    size={96}
                    locked={!selUnlocked}
                  />

                  <div className="flex flex-col items-center gap-0.5">
                    <div className="text-[11px] font-medium text-sky-100/70">
                      Dianugerahkan kepada <span className="font-extrabold text-white">{playerName}</span>
                    </div>
                    <h3
                      className="text-[22px] sm:text-[24px] font-extrabold leading-tight tracking-tight"
                      style={{ color: selRarity.titleCol }}
                    >
                      {selected.name}
                    </h3>
                  </div>

                  {/* Ornate Folded Julukan Ribbon */}
                  <div className="relative px-5 py-1.5 mt-0.5">
                    <div
                      className="relative px-5 py-1.5 rounded-lg border-2 shadow-lg"
                      style={{
                        borderColor: selRarity.borderCol,
                        background: "linear-gradient(180deg, rgba(15,23,42,0.88) 0%, rgba(4,10,24,0.96) 100%)",
                      }}
                    >
                      <div className="text-[9.5px] font-extrabold uppercase tracking-[0.2em] text-amber-200/75">
                        Julukan Resmi
                      </div>
                      <div className="text-[17px] font-extrabold tracking-wide text-yellow-300">
                        « {selected.titleReward} »
                      </div>
                    </div>
                  </div>

                  <p className="text-[12.5px] leading-relaxed text-sky-100/85 max-w-[320px]">
                    {selected.flavorText}
                  </p>
                </div>

                {/* Bottom Requirement, Progress & Seal */}
                <div className="relative z-10 w-full flex flex-col gap-2.5 pt-3 border-t border-white/10">
                  <div className="text-[12px] font-bold text-amber-100">
                    Syarat: <span className="text-white">{selected.requirementText}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-[11.5px] font-bold">
                      <span className={selUnlocked ? "text-emerald-300" : "text-amber-200/80"}>
                        {selUnlocked ? "✓ Piagam Terbuka" : "Progres Pencapaian"}
                      </span>
                      <span className="text-yellow-200 tabular-nums">{selProg.label}</span>
                    </div>
                    <div className="ff-bar-slot h-2.5 overflow-hidden">
                      <div
                        className="h-full transition-all duration-300"
                        style={{
                          width: `${Math.max(4, selProg.pct)}%`,
                          background: selUnlocked
                            ? "linear-gradient(90deg, #10b981, #6ee7b7)"
                            : `linear-gradient(90deg, ${selRarity.sealBot}, ${selRarity.sealTop})`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    {/* Wax/Metal Seal Stamp */}
                    <div className="flex items-center gap-2 text-left">
                      <div
                        className="w-9 h-9 rounded-full flex items-center justify-center font-black text-[11px] border-2 shadow-md shrink-0"
                        style={{
                          background: selUnlocked
                            ? `linear-gradient(180deg, ${selRarity.sealTop}, ${selRarity.sealBot})`
                            : "#1e293b",
                          borderColor: selUnlocked ? selRarity.borderCol : "#475569",
                          color: selUnlocked ? selRarity.sealText : "#94a3b8",
                        }}
                      >
                        {selUnlocked ? "SAH" : "🔒"}
                      </div>
                      <div className="text-[11px] leading-tight text-sky-100/75">
                        {selUnlocked && save.unlockedTrophies[selected.id]?.unlockedAt
                          ? `Diraih ${new Date(save.unlockedTrophies[selected.id].unlockedAt).toLocaleDateString("id-ID")}`
                          : "Belum Terbuka"}
                      </div>
                    </div>

                    {selUnlocked ? (
                      <button
                        type="button"
                        onClick={() => onEquipTitle(selEquipped ? null : selected.titleReward)}
                        className="ui-btn px-4 py-2 min-h-[40px] text-[13px] text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200"
                        style={{
                          background: selEquipped
                            ? "linear-gradient(180deg, #10b981, #047857)"
                            : "linear-gradient(180deg, #ff9938, #d95b12)",
                        }}
                      >
                        {selEquipped ? "✓ Julukan Dipasang" : "👑 Pasang Julukan"}
                      </button>
                    ) : (
                      <span className="text-[11.5px] font-bold text-amber-200/75 whitespace-nowrap">
                        Mainkan ronde untuk membuka
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT: FILTER BAR + COLLECTIBLE PLAQUE WALL */}
          <div className="lg:col-span-7 flex flex-col gap-3 min-w-0">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter kategori piagam">
                {[
                  { id: "all" as const, label: `Semua (${TROPHIES.length})` },
                  { id: "rank1" as const, label: "👑 Juara #1" },
                  { id: "peak" as const, label: "⚡ Puncak Level & Durasi" },
                  { id: "ocean" as const, label: "🌊 Rekor Lautan" },
                ].map((t) => {
                  const active = filter === t.id;
                  return (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={active}
                      type="button"
                      onClick={() => setFilter(t.id)}
                      className="ui-btn px-3.5 py-1.5 min-h-[38px] text-[13px] text-white whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200"
                      style={{
                        background: active ? "linear-gradient(180deg, #ff9938, #d95b12)" : "#4d2c14",
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="wood-scroll flex-1 max-h-[470px] overflow-y-auto pr-1.5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {filtered.map((spec) => {
                  const meta = RARITY_META[spec.rarity];
                  const unlocked = !!save.unlockedTrophies[spec.id] || isTrophyMet(spec, save);
                  const prog = getTrophyProgress(spec, save);
                  const isSelected = selected.id === spec.id;
                  const isEquipped = save.equippedTitle === spec.titleReward;

                  return (
                    <button
                      key={spec.id}
                      type="button"
                      onClick={() => setSelectedId(spec.id)}
                      className={`relative rounded-[14px] p-[2px] text-left cursor-pointer transition-transform duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-200 ${
                        isSelected ? "scale-[1.01]" : "hover:-translate-y-0.5"
                      }`}
                      style={{
                        background: isSelected ? "#fde047" : unlocked ? meta.frameGrad : "#3b2310",
                        boxShadow: isSelected ? `0 0 18px ${meta.glow}` : "0 4px 10px rgba(0,0,0,0.45)",
                      }}
                    >
                      <div
                        className="rounded-[12px] p-3 flex items-center gap-3 h-full"
                        style={{
                          background: unlocked ? meta.plateBg : "linear-gradient(180deg, #1b120c 0%, #120b07 100%)",
                        }}
                      >
                        <div className="shrink-0">
                          <PlaqueEmblem
                            emblem={spec.emblem}
                            accent={meta.accentCol}
                            sealTop={meta.sealTop}
                            sealBot={meta.sealBot}
                            size={56}
                            locked={!unlocked}
                          />
                        </div>

                        <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                          <div className="flex items-center justify-between gap-2 text-[10.5px] font-bold">
                            <span style={{ color: meta.accentCol }}>
                              {meta.label} · {spec.badgeTag}
                            </span>
                            {isEquipped ? (
                              <span className="text-emerald-300 whitespace-nowrap">✓ Dipasang</span>
                            ) : unlocked ? (
                              <span className="text-yellow-300 whitespace-nowrap">Terbuka</span>
                            ) : (
                              <span className="text-amber-200/55 tabular-nums whitespace-nowrap">{prog.pct}%</span>
                            )}
                          </div>

                          <div
                            className="text-[14.5px] font-extrabold truncate leading-snug"
                            style={{ color: unlocked ? meta.titleCol : "#e2d6c8" }}
                          >
                            {spec.name}
                          </div>

                          <div className="text-[12px] font-bold text-yellow-300/95 truncate">
                            Julukan: « {spec.titleReward} »
                          </div>

                          <div className="text-[11px] text-sky-100/70 truncate">
                            {spec.requirementText}
                          </div>

                          {/* Mini progress track */}
                          <div className="h-1.5 w-full rounded-full bg-black/50 overflow-hidden mt-1 border border-white/10">
                            <div
                              className="h-full"
                              style={{
                                width: `${Math.max(4, prog.pct)}%`,
                                background: unlocked
                                  ? "linear-gradient(90deg, #10b981, #6ee7b7)"
                                  : `linear-gradient(90deg, ${meta.sealBot}, ${meta.sealTop})`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
