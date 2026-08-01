import { simulate } from "./simulate";
import type { Difficulty } from "../ai/strategies";

const games = Number(
  process.argv.find((a) => a.startsWith("--games="))?.split("=")[1] ?? 1000,
);
const seed = Number(
  process.argv.find((a) => a.startsWith("--seed="))?.split("=")[1] ?? 1,
);
const difficulties: Difficulty[] = ["easy", "medium", "hard"];

console.log(`Simulating ${games} games per difficulty (seed ${seed})\n`);
console.log("difficulty   mean   median   min   max");

for (const difficulty of difficulties) {
  const started = Date.now();
  const stats = simulate(difficulty, games, seed);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `${stats.difficulty.padEnd(10)} ${stats.mean.toFixed(1).padStart(6)} ` +
      `${String(stats.median).padStart(8)} ${String(stats.min).padStart(5)} ` +
      `${String(stats.max).padStart(5)}   (${elapsed}s)`,
  );
}
