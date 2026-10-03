// Расчёт дозы живёт в двух копиях: src/_data/alchemy.js (сборка) и
// src/scripts/alchemy-lab.js (браузер, CommonJS ему недоступен). Тест вырезает
// чистые функции из клиентского файла и сверяет их с реестром на всех наборах
// до трёх ингредиентов и на случайных наборах побольше.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const alchemy = require(path.join(root, "src/_data/alchemy.js"));
const registrySource = fs.readFileSync(path.join(root, "src/_data/alchemy.js"), "utf8");
const labSource = fs.readFileSync(path.join(root, "src/scripts/alchemy-lab.js"), "utf8");

// Всё, что в клиентском файле стоит до initLab, не трогает DOM
const pure = labSource.slice(0, labSource.indexOf("function initLab"));
const lab = new Function(`${pure}; return { brewRows, tierGapOf, brewDcOf, brewMinutesOf };`)();

const ingredientById = new Map(alchemy.ingredients.map((i) => [i.id, i]));
const effectById = new Map(alchemy.effects.map((e) => [e.id, e]));
const ingredientIds = alchemy.ingredients.map((i) => i.id);
const tierIds = alchemy.tiers.map((t) => t.id);

function constants(source) {
  return Object.fromEntries([...source.matchAll(/^const ([A-Z_]+) = (\d+);/gm)].map((m) => [m[1], Number(m[2])]));
}

function flat(rows) {
  return rows.map((r) => `${r.effect.id}:${r.count}:${r.stacks}:${r.extra}`).join("|");
}

function compare(set) {
  for (const area of [false, true]) {
    const rows = alchemy.brew(set, ingredientById, effectById, area);
    const labRows = lab.brewRows(set, ingredientById, effectById, area);
    assert.equal(flat(labRows), flat(rows), `brew ${set.join(", ")} (area: ${area})`);
    const removals = [[], rows.slice(0, 1).map((r) => r.effect.id), rows.map((r) => r.effect.id)];
    for (const tier of tierIds) {
      for (const removed of removals) {
        const gap = alchemy.tierGap(rows, removed, tier, alchemy.tiers);
        assert.equal(lab.tierGapOf(labRows, removed, tier, alchemy.tiers), gap, `tierGap ${set.join(", ")} at ${tier}`);
        assert.equal(lab.brewDcOf(labRows, removed, gap), alchemy.brewDc(rows, removed, gap), `brewDc ${set.join(", ")} at ${tier}`);
      }
    }
  }
}

test("constants shared by the registry and the lab are equal", () => {
  const registry = constants(registrySource);
  const client = constants(labSource);
  const shared = Object.keys(client).filter((name) => name in registry);
  assert.ok(shared.includes("MAX_STACKS") && shared.includes("BREW_DC_BASE") && shared.includes("SAVE_DC_BASE"));
  for (const name of shared) assert.equal(client[name], registry[name], name);
});

test("brew, tierGap and brewDc agree on every set of up to three ingredients", () => {
  function sets(size, from, picked) {
    if (size === 0) return compare(picked);
    for (let i = from; i < ingredientIds.length; i++) sets(size - 1, i, [...picked, ingredientIds[i]]);
  }
  for (let size = 0; size <= 3; size++) sets(size, 0, []);
});

test("brew, tierGap and brewDc agree on large sets with repeated ingredients", () => {
  // Генератор с фиксированным зерном: падение воспроизводится
  let seed = 12345;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = (list) => list[Math.floor(random() * list.length)];
  for (let n = 0; n < 5000; n++) {
    // Мало разных трав на много порций — так появляются доли сверх трёх и extra
    const pool = Array.from({ length: 1 + Math.floor(random() * 4) }, () => pick(ingredientIds));
    compare(Array.from({ length: 4 + Math.floor(random() * 4) }, () => pick(pool)));
  }
});

test("brewMinutes agrees for every Сл", () => {
  for (let dc = -5; dc <= 80; dc++) assert.equal(lab.brewMinutesOf(dc), alchemy.brewMinutes(dc), `Сл ${dc}`);
});

test("examples from the rules page", () => {
  const dcOf = (set, tier, removed = []) => {
    const rows = alchemy.brew(set, ingredientById, effectById);
    return alchemy.brewDc(rows, removed, alchemy.tierGap(rows, removed, tier, alchemy.tiers));
  };
  assert.equal(dcOf(["burning-root", "urchin-spine"], "apprentice"), 11);
  assert.equal(dcOf(["black-lotus", "barrow-root"], "master"), 11);
  assert.equal(dcOf(["black-lotus", "barrow-root"], "apprentice"), 21);
  assert.deepEqual([11, 17, 22].map(alchemy.brewMinutes), [5, 35, 60]);
  // На площади доля вычитается до потолка: пять порций пороха — полные три доли Взрыва
  const stacksOf = (set, area) => Object.fromEntries(alchemy.brew(set, ingredientById, effectById, area).map((r) => [r.effect.id, r.stacks]));
  assert.equal(stacksOf(Array(4).fill("black-powder"), true).blast, 2);
  assert.equal(stacksOf(Array(5).fill("black-powder"), true).blast, 3);
  assert.equal(stacksOf(Array(5).fill("black-powder"), false).damage, 3);
});
