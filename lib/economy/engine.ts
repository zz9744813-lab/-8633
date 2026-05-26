import { Agent } from "@/lib/agent/agent";
import { BuildingEconomy } from "@/lib/types";

// Item definitions
export const ITEMS: Record<string, { name: string; category: string; basePrice: number }> = {
  bread: { name: "面包", category: "food", basePrice: 5 },
  meat: { name: "肉", category: "food", basePrice: 12 },
  ale: { name: "麦酒", category: "drink", basePrice: 3 },
  cloth: { name: "布料", category: "material", basePrice: 8 },
  tool: { name: "工具", category: "tool", basePrice: 20 },
  wood: { name: "木材", category: "material", basePrice: 4 },
  iron: { name: "铁", category: "material", basePrice: 15 },
  potion: { name: "药剂", category: "medicine", basePrice: 25 },
};

// Initialize economy for a building based on its type
export function initBuildingEconomy(type: string, tick: number): BuildingEconomy {
  const base: Record<string, { stock: number; price: number }> = {
    tavern: { stock: 30, price: 3 },    // ale
    bakery: { stock: 20, price: 5 },    // bread
    market: { stock: 50, price: 4 },    // wood
    smithy: { stock: 10, price: 20 },   // tool
    tailor: { stock: 15, price: 8 },    // cloth
    clinic: { stock: 5, price: 25 },    // potion
  };

  const itemMap: Record<string, string> = {
    tavern: "ale", bakery: "bread", market: "wood",
    smithy: "tool", tailor: "cloth", clinic: "potion",
  };

  const wageMap: Record<string, number> = {
    tavern: 3, bakery: 4, market: 3, smithy: 6,
    tailor: 4, clinic: 5, default: 2,
  };

  const itemId = itemMap[type];
  const cfg = base[type];
  const inventory: Record<string, number> = {};
  const prices: Record<string, number> = {};

  if (itemId && cfg) {
    inventory[itemId] = cfg.stock;
    prices[itemId] = cfg.price;
  }

  return {
    inventory,
    prices,
    wage: wageMap[type] ?? wageMap.default,
    lastRestockTick: tick,
  };
}

// Price fluctuation based on supply/demand
export function calculatePrice(
  basePrice: number,
  stock: number,
  maxStock: number
): number {
  const ratio = maxStock > 0 ? stock / maxStock : 0.5;
  const multiplier = 0.5 + (1 - ratio); // 0.5x to 1.5x base price
  return Math.round(basePrice * multiplier * 100) / 100;
}

// Compute wallet display for UI
export function formatMoney(amount: number): string {
  return `${amount.toFixed(1)} 币`;
}
