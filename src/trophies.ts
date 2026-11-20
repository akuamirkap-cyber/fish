import type { SaveData, TrophyUnlockRecord } from "./save";

export type TrophyCategory = "rank1" | "peak" | "ocean";
export type TrophyRarity = "perunggu" | "perak" | "emas" | "zamrud" | "mistik" | "legenda";
export type TrophyEmblem = "crown" | "trident" | "crown50" | "leviathan" | "evo" | "chrono" | "lightning" | "supernova" | "chest" | "vortex" | "abyss";

export interface TrophySpec {
  id: string;
  category: TrophyCategory;
  rarity: TrophyRarity;
  emblem: TrophyEmblem;
  badgeTag: string;
  name: string;
  titleReward: string; // Julukan
  requirementText: string;
  flavorText: string;
  target: number;
  mode: "count_gte" | "time_lte" | "stat_gte";
  metricKey: "rank1Count" | "peakLevelCount" | "bestPeakTimeSec" | "best" | "bestCombo" | "bestDepth";
}

export const RARITY_META: Record<
  TrophyRarity,
  {
    label: string;
    frameGrad: string;
    plateBg: string;
    borderCol: string;
    accentCol: string;
    titleCol: string;
    sealTop: string;
    sealBot: string;
    sealText: string;
    glow: string;
  }
> = {
  perunggu: {
    label: "Perunggu",
    frameGrad: "linear-gradient(145deg, #d99b66 0%, #9a5b2b 52%, #5c3114 100%)",
    plateBg: "radial-gradient(ellipse at 50% 24%, #402615 0%, #24140a 72%, #170c05 100%)",
    borderCol: "#d4955e",
    accentCol: "#f5c28e",
    titleCol: "#fde2bd",
    sealTop: "#f4b982",
    sealBot: "#9a4d1e",
    sealText: "#2c1104",
    glow: "rgba(217, 155, 102, 0.35)",
  },
  perak: {
    label: "Perak",
    frameGrad: "linear-gradient(145deg, #f1f5f9 0%, #94a3b8 48%, #475569 100%)",
    plateBg: "radial-gradient(ellipse at 50% 24%, #1e334f 0%, #0f1c30 72%, #091220 100%)",
    borderCol: "#cbd5e1",
    accentCol: "#bae6fd",
    titleCol: "#f0f9ff",
    sealTop: "#f8fafc",
    sealBot: "#64748b",
    sealText: "#0f172a",
    glow: "rgba(186, 230, 253, 0.38)",
  },
  emas: {
    label: "Emas",
    frameGrad: "linear-gradient(145deg, #fff3a1 0%, #f59e0b 50%, #92400e 100%)",
    plateBg: "radial-gradient(ellipse at 50% 24%, #3c2608 0%, #211404 72%, #140b02 100%)",
    borderCol: "#fbbf24",
    accentCol: "#fde68a",
    titleCol: "#fef08a",
    sealTop: "#fef08a",
    sealBot: "#d97706",
    sealText: "#451a03",
    glow: "rgba(251, 191, 36, 0.45)",
  },
  zamrud: {
    label: "Zamrud",
    frameGrad: "linear-gradient(145deg, #a7f3d0 0%, #10b981 48%, #064e3b 100%)",
    plateBg: "radial-gradient(ellipse at 50% 24%, #083933 0%, #04201f 74%, #021213 100%)",
    borderCol: "#34d399",
    accentCol: "#6ee7b7",
    titleCol: "#a7f3d0",
    sealTop: "#a7f3d0",
    sealBot: "#059669",
    sealText: "#022c22",
    glow: "rgba(52, 211, 153, 0.44)",
  },
  mistik: {
    label: "Mistik",
    frameGrad: "linear-gradient(145deg, #fde68a 0%, #f472b6 45%, #7e22ce 100%)",
    plateBg: "radial-gradient(ellipse at 50% 24%, #2d144b 0%, #180a2d 74%, #0d051a 100%)",
    borderCol: "#f0abfc",
    accentCol: "#fde047",
    titleCol: "#fef08a",
    sealTop: "#fef08a",
    sealBot: "#a855f7",
    sealText: "#2e1065",
    glow: "rgba(232, 121, 249, 0.52)",
  },
  legenda: {
    label: "Legenda",
    frameGrad: "linear-gradient(145deg, #fef9c3 0%, #38bdf8 38%, #fbbf24 72%, #1e3a8a 100%)",
    plateBg: "radial-gradient(ellipse at 50% 22%, #112a5c 0%, #091636 68%, #04091b 100%)",
    borderCol: "#fde047",
    accentCol: "#7dd3fc",
    titleCol: "#fef9c3",
    sealTop: "#fef08a",
    sealBot: "#0284c7",
    sealText: "#082f49",
    glow: "rgba(103, 232, 249, 0.55)",
  },
};

export const TROPHIES: TrophySpec[] = [
  // ---- JUARA #1 MILESTONES ----
  {
    id: "rank1_1",
    category: "rank1",
    rarity: "perunggu",
    emblem: "crown",
    badgeTag: "1× #1",
    name: "Piagam Mahkota Perdana",
    titleReward: "Penakluk Baru",
    requirementText: "Capai Peringkat #1 sebanyak 1 kali",
    flavorText: "Langkah pertama menaklukkan seluruh lautan dan merebut takhta teratas.",
    target: 1,
    mode: "count_gte",
    metricKey: "rank1Count",
  },
  {
    id: "rank1_5",
    category: "rank1",
    rarity: "perak",
    emblem: "trident",
    badgeTag: "5× #1",
    name: "Piagam Trisula Perak",
    titleReward: "Jagoan Karang",
    requirementText: "Capai Peringkat #1 sebanyak 5 kali",
    flavorText: "Kehadiranmu di terumbu karang membuat para rival berpikir dua kali.",
    target: 5,
    mode: "count_gte",
    metricKey: "rank1Count",
  },
  {
    id: "rank1_15",
    category: "rank1",
    rarity: "emas",
    emblem: "crown",
    badgeTag: "15× #1",
    name: "Piagam Singgasana Emas",
    titleReward: "Raja Terumbu",
    requirementText: "Capai Peringkat #1 sebanyak 15 kali",
    flavorText: "Lima belas kali berdiri di puncak rantai makanan tanpa tersentuh.",
    target: 15,
    mode: "count_gte",
    metricKey: "rank1Count",
  },
  {
    id: "rank1_30",
    category: "rank1",
    rarity: "zamrud",
    emblem: "trident",
    badgeTag: "30× #1",
    name: "Piagam Leviathan Zamrud",
    titleReward: "Penguasa Arus",
    requirementText: "Capai Peringkat #1 sebanyak 30 kali",
    flavorText: "Arus samudra tunduk pada strategi dan kecepatanmu memburu mangsa.",
    target: 30,
    mode: "count_gte",
    metricKey: "rank1Count",
  },
  {
    id: "rank1_50",
    category: "rank1",
    rarity: "mistik",
    emblem: "crown50",
    badgeTag: "50× #1",
    name: "Piagam Mahkota Abadi 50",
    titleReward: "Kaisar 50 Mahkota",
    requirementText: "Capai Peringkat #1 sebanyak 50 kali",
    flavorText: "Lima puluh takhta ditaklukkan. Namamu terukir abadi dalam sejarah samudra.",
    target: 50,
    mode: "count_gte",
    metricKey: "rank1Count",
  },
  {
    id: "rank1_100",
    category: "rank1",
    rarity: "legenda",
    emblem: "leviathan",
    badgeTag: "100× #1",
    name: "Piagam Dewa Samudra",
    titleReward: "Legenda Abisal",
    requirementText: "Capai Peringkat #1 sebanyak 100 kali",
    flavorText: "Seratus kejayaan puncak. Tidak ada predator di lautan yang menandingi legendamu.",
    target: 100,
    mode: "count_gte",
    metricKey: "rank1Count",
  },

  // ---- PUNCAK LEVEL & KECEPATAN DURASI ----
  {
    id: "peak_any",
    category: "peak",
    rarity: "perak",
    emblem: "evo",
    badgeTag: "Lv MAX",
    name: "Piagam Evolusi Puncak",
    titleReward: "Predator Puncak",
    requirementText: "Capai Puncak Level (Predator Tertinggi)",
    flavorText: "Tumbuh dari ikan mungil hingga mampu memangsa Goliath Orca.",
    target: 1,
    mode: "count_gte",
    metricKey: "peakLevelCount",
  },
  {
    id: "peak_240",
    category: "peak",
    rarity: "emas",
    emblem: "chrono",
    badgeTag: "≤ 4 Menit",
    name: "Piagam Arus Deras",
    titleReward: "Pemburu Tangguh",
    requirementText: "Capai Puncak Level dalam ≤ 240 detik (4 menit)",
    flavorText: "Pertumbuhan konsisten menembus seluruh tingkatan rantai makanan dalam 4 menit.",
    target: 240,
    mode: "time_lte",
    metricKey: "bestPeakTimeSec",
  },
  {
    id: "peak_150",
    category: "peak",
    rarity: "zamrud",
    emblem: "chrono",
    badgeTag: "≤ 2m 30d",
    name: "Piagam Haluan Kilat",
    titleReward: "Kilat Samudra",
    requirementText: "Capai Puncak Level dalam ≤ 150 detik (2m 30d)",
    flavorText: "Menyedot kawanan ikan beruntun tanpa jeda hingga menjadi raksasa lautan.",
    target: 150,
    mode: "time_lte",
    metricKey: "bestPeakTimeSec",
  },
  {
    id: "peak_90",
    category: "peak",
    rarity: "mistik",
    emblem: "lightning",
    badgeTag: "≤ 90 Detik",
    name: "Piagam Pusaran Kronos",
    titleReward: "Tuan Waktu Laut",
    requirementText: "Capai Puncak Level dalam ≤ 90 detik (1m 30d)",
    flavorText: "Evolusi secepat kilat — dalam satu setengah menit kamu menguasai samudra.",
    target: 90,
    mode: "time_lte",
    metricKey: "bestPeakTimeSec",
  },
  {
    id: "peak_55",
    category: "peak",
    rarity: "legenda",
    emblem: "supernova",
    badgeTag: "≤ 55 Detik",
    name: "Piagam Supernova Abisal",
    titleReward: "Dewa Evolusi Kilat",
    requirementText: "Capai Puncak Level dalam ≤ 55 detik",
    flavorText: "Kecepatan mustahil! Dari ikan pemula ke puncak rantai makanan di bawah 1 menit.",
    target: 55,
    mode: "time_lte",
    metricKey: "bestPeakTimeSec",
  },

  // ---- PRESTASI LAUTAN LAINNYA ----
  {
    id: "score_25k",
    category: "ocean",
    rarity: "emas",
    emblem: "chest",
    badgeTag: "25.000+",
    name: "Piagam Harta Samudra",
    titleReward: "Kolektor Frenzy",
    requirementText: "Raih Skor Terbaik minimal 25.000",
    flavorText: "Peti mutiara dan kawanan emas mengalir deras dalam satu ronde legendaris.",
    target: 25000,
    mode: "stat_gte",
    metricKey: "best",
  },
  {
    id: "combo_18",
    category: "ocean",
    rarity: "zamrud",
    emblem: "vortex",
    badgeTag: "Combo x18",
    name: "Piagam Pusaran Maelstrom",
    titleReward: "Vortex Hidup",
    requirementText: "Cetak Kombo Sedot minimal x18",
    flavorText: "Tarikan arus tanpa henti yang menyapu bersih seisi gerombolan ikan.",
    target: 18,
    mode: "stat_gte",
    metricKey: "bestCombo",
  },
  {
    id: "depth_6500",
    category: "ocean",
    rarity: "mistik",
    emblem: "abyss",
    badgeTag: "6.500 m",
    name: "Piagam Penjelajah Palung",
    titleReward: "Penjaga Palung",
    requirementText: "Menyelam hingga kedalaman minimal 6.500 m",
    flavorText: "Menembus kegelapan Zona Malam dan berdiri gagah di dasar Palung Abisal.",
    target: 6500,
    mode: "stat_gte",
    metricKey: "bestDepth",
  },
];

export function formatSecShort(sec: number): string {
  if (sec < 60) return `${sec} detik`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? `${m} menit` : `${m}m ${s.toString().padStart(2, "0")}d`;
}

export function isTrophyMet(spec: TrophySpec, save: SaveData): boolean {
  if (spec.mode === "time_lte") {
    const val = save.bestPeakTimeSec;
    return val !== null && val <= spec.target;
  }
  const raw = save[spec.metricKey];
  return typeof raw === "number" && raw >= spec.target;
}

export function getTrophyProgress(spec: TrophySpec, save: SaveData): { pct: number; label: string } {
  const unlocked = !!save.unlockedTrophies[spec.id] || isTrophyMet(spec, save);
  if (spec.mode === "time_lte") {
    const best = save.bestPeakTimeSec;
    if (best === null) {
      return { pct: 0, label: `Belum mencapai puncak level · Target ≤ ${formatSecShort(spec.target)}` };
    }
    if (best <= spec.target) {
      return { pct: 100, label: `Tercapai dalam ${formatSecShort(best)} (Target ≤ ${formatSecShort(spec.target)})` };
    }
    const pct = Math.max(12, Math.min(95, Math.round((spec.target / best) * 100)));
    return { pct, label: `Rekor tercepat: ${formatSecShort(best)} · Target ≤ ${formatSecShort(spec.target)}` };
  }
  const cur = Number(save[spec.metricKey] ?? 0);
  const pct = unlocked ? 100 : Math.max(0, Math.min(99, Math.round((cur / spec.target) * 100)));
  return {
    pct,
    label: `${Math.min(cur, spec.target).toLocaleString("en-US")} / ${spec.target.toLocaleString("en-US")}`,
  };
}

export function evaluateUnlocks(save: SaveData): {
  nextUnlocked: Record<string, TrophyUnlockRecord>;
  newlyUnlocked: TrophySpec[];
} {
  const nextUnlocked: Record<string, TrophyUnlockRecord> = { ...save.unlockedTrophies };
  const newlyUnlocked: TrophySpec[] = [];
  const now = Date.now();

  for (const spec of TROPHIES) {
    if (nextUnlocked[spec.id]) continue;
    if (isTrophyMet(spec, save)) {
      const bestMetric =
        spec.mode === "time_lte"
          ? (save.bestPeakTimeSec ?? undefined)
          : Number(save[spec.metricKey] ?? 0);
      nextUnlocked[spec.id] = { unlockedAt: now, bestMetric };
      newlyUnlocked.push(spec);
    }
  }
  return { nextUnlocked, newlyUnlocked };
}
