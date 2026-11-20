import type { Upgrades } from "./game/engine";
import { SKINS } from "./game/species";

// every fish is unlocked from the start
const ALL_SKINS = () => SKINS.map((s) => s.id);

export interface TrophyUnlockRecord {
  unlockedAt: number;
  bestMetric?: number;
}

export interface SaveData {
  coins: number;
  upgrades: Upgrades;
  owned: string[];
  skin: string;
  name: string;
  best: number;
  speedPref: number;
  rank1Count: number;
  peakLevelCount: number;
  bestPeakTimeSec: number | null;
  bestCombo: number;
  bestDepth: number;
  totalRuns: number;
  unlockedTrophies: Record<string, TrophyUnlockRecord>;
  equippedTitle: string | null;
  mode3D: boolean;
  reef3D: boolean;
}

const KEY = "ffio-save-v1";

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const owned = ALL_SKINS();
      const rawSkin = d.skin === "boris_3d" ? "boris" : d.skin;
      return {
        coins: d.coins ?? 0,
        upgrades: { suck: 0, speed: 0, size: 0, ...(d.upgrades || {}) },
        owned,
        skin: owned.includes(rawSkin) ? rawSkin : "andy",
        name: d.name ?? "",
        best: d.best ?? 0,
        speedPref: typeof d.speedPref === "number" ? Math.max(0.7, Math.min(1.8, d.speedPref)) : 1.0,
        rank1Count: typeof d.rank1Count === "number" ? d.rank1Count : 0,
        peakLevelCount: typeof d.peakLevelCount === "number" ? d.peakLevelCount : 0,
        bestPeakTimeSec: typeof d.bestPeakTimeSec === "number" ? d.bestPeakTimeSec : null,
        bestCombo: typeof d.bestCombo === "number" ? d.bestCombo : 0,
        bestDepth: typeof d.bestDepth === "number" ? d.bestDepth : 0,
        totalRuns: typeof d.totalRuns === "number" ? d.totalRuns : 0,
        unlockedTrophies: d.unlockedTrophies && typeof d.unlockedTrophies === "object" ? d.unlockedTrophies : {},
        equippedTitle: typeof d.equippedTitle === "string" ? d.equippedTitle : null,
        mode3D: d.skin === "boris_3d" ? true : !!d.mode3D,
        reef3D: d.reef3D === undefined ? true : !!d.reef3D,
      };
    }
  } catch {
    /* ignore */
  }
  return {
    coins: 0,
    upgrades: { suck: 0, speed: 0, size: 0 },
    owned: ALL_SKINS(),
    skin: "andy",
    name: "",
    best: 0,
    speedPref: 1.0,
    rank1Count: 0,
    peakLevelCount: 0,
    bestPeakTimeSec: null,
    bestCombo: 0,
    bestDepth: 0,
    totalRuns: 0,
    unlockedTrophies: {},
    equippedTitle: null,
    mode3D: false,
    reef3D: true,
  };
}

export function writeSave(d: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d));
  } catch {
    /* ignore */
  }
}

export const UPGRADE_COSTS = [40, 100, 220, 450, 800];
export const MAX_UPGRADE = UPGRADE_COSTS.length;
