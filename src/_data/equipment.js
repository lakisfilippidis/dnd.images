// Снаряжение: реестр оружия и доспехов для страницы /Equipment/ и страниц
// персонажей. Устроен как черты (feats.js): каждый предмет — markdown-файл в
// src/_data/equipment/weapons/ или src/_data/equipment/armor/, числовой
// префикс имени файла задаёт порядок, имя без префикса — id. Рендер —
// шорткоды weaponList / armorList / weaponCards / armorCards / weaponPicks /
// armorPicks в eleventy.config.js.
//
// Оружие: group (группа — ось фильтра и иконка), tier (владение: простое,
// воинское, пороховое), damage («1d8» или «1d6/1d8» для универсального),
// type (вид урона, по-русски: рубящий / колющий / дробящий), props (свойства
// списком [finesse, thrown]), range («20/60» у метательного и дальнобойного,
// «15» у оружия с досягаемостью). Тело — описание, может быть пустым.
//
// Доспехи: slot (body — комплект, shield — щит, extra — деталь без КБ: шлем,
// перчатки), weight (только у body: light / medium / heavy — от веса зависит,
// сколько Ловкости идёт в КБ), ac (у body — КБ комплекта вместе с десяткой,
// у shield — бонус). Меткость и итоговый КБ считает шорткод на странице
// персонажа из его stats; здесь только справочные значения.
const fs = require("node:fs");
const path = require("node:path");
const { parseFrontMatter, md } = require("./feats.js");

const groups = [
  { id: "sword", title: "Мечи и сабли", icon: "sword2.svg" },
  { id: "dagger", title: "Кинжалы и ножи", icon: "combat-knife.svg" },
  { id: "axe", title: "Топоры и молоты", icon: "tomahawk.svg" },
  { id: "polearm", title: "Копья и посохи", icon: "halberd.svg" },
  { id: "bow", title: "Луки и пращи", icon: "bow2.svg" },
  { id: "crossbow", title: "Арбалеты", icon: "crossbow.svg" },
  { id: "gun", title: "Пороховое", icon: "musket.svg" },
  { id: "shield", title: "Щиты", icon: "weapon2.svg" },
  { id: "special", title: "Особое", icon: "hookey.svg" },
];

// Владение: простым оружием владеют все, воинское даёт класс, пороховое —
// класс или черта; дикари-лангуркхаи пороховым и арбалетами не владеют.
const tiers = [
  { id: "simple", title: "Простое", icon: "stick.svg" },
  { id: "martial", title: "Воинское", icon: "weapon.svg" },
  { id: "powder", title: "Пороховое", icon: "culverin.svg" },
];

// Вид урона — те три, что перечислены в правилах. В файлах пишется по-русски.
const damageTypes = [
  { id: "slash", title: "рубящий", icon: "bardiche.svg" },
  { id: "pierce", title: "колющий", icon: "trident.svg" },
  { id: "bludgeon", title: "дробящий", icon: "mace.svg" },
];

// Свойства оружия — чипы на карточке. finesse и light переключают меткость
// на Ловкость, ranged — тоже; versatile даёт второй кубик урона в двух руках.
const props = [
  { id: "light", title: "Лёгкое" },
  { id: "finesse", title: "Фехтовальное" },
  { id: "heavy", title: "Тяжёлое" },
  { id: "two-handed", title: "Двуручное" },
  { id: "versatile", title: "Универсальное" },
  { id: "thrown", title: "Метательное" },
  { id: "ranged", title: "Дальнобойное" },
  { id: "loading", title: "Заряжание" },
  { id: "reload", title: "Перезарядка" },
  { id: "reach", title: "Досягаемость" },
];

const slots = [
  { id: "body", title: "Комплект", icon: "plate-armour2.svg" },
  { id: "shield", title: "Щит", icon: "weapon2.svg" },
  { id: "extra", title: "Деталь", icon: "helmet.svg" },
];

// dexCap: сколько модификатора Ловкости идёт в КБ (null — весь).
const weights = [
  { id: "light", title: "Лёгкий", icon: "leather-jacket.svg", dexCap: null, dexRule: "+ Ловкость" },
  { id: "medium", title: "Средний", icon: "crusades1.svg", dexCap: 2, dexRule: "+ Ловкость (не больше +2)" },
  { id: "heavy", title: "Тяжёлый", icon: "plate-armour.svg", dexCap: 0, dexRule: "без Ловкости" },
];

const ids = (list) => new Set(list.map((x) => x.id));
const groupIds = ids(groups);
const tierIds = ids(tiers);
const propIds = ids(props);
const slotIds = ids(slots);
const weightIds = ids(weights);
const damageByTitle = new Map(damageTypes.map((t) => [t.title, t.id]));

function readDir(sub) {
  const dir = path.join(__dirname, "equipment", sub);
  const seen = new Set();
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort()
    .map((file) => {
      const label = `equipment/${sub}/${file}`;
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const { data, body } = parseFrontMatter(raw, label);
      const id = file.replace(/^\d+-/, "").replace(/\.md$/, "");
      if (seen.has(id)) throw new Error(`${label}: id "${id}" уже есть в другом файле`);
      seen.add(id);
      if (!data.name) throw new Error(`${label}: нет поля name`);
      return { id, label, data, desc: body ? md.render(body).trim() : "" };
    });
}

const weapons = readDir("weapons").map(({ id, label, data, desc }) => {
  if (!groupIds.has(data.group)) throw new Error(`${label}: неизвестная группа "${data.group}"`);
  if (!tierIds.has(data.tier)) throw new Error(`${label}: неизвестное владение "${data.tier}"`);
  if (!/^\d+d\d+(\/\d+d\d+)?$/.test(data.damage ?? "")) throw new Error(`${label}: урон "${data.damage}" — ожидается 1d8 или 1d6/1d8`);
  const type = damageByTitle.get(data.type);
  if (!type) throw new Error(`${label}: неизвестный вид урона "${data.type}"`);
  const list = Array.isArray(data.props) ? data.props : data.props ? [data.props] : [];
  for (const p of list) {
    if (!propIds.has(p)) throw new Error(`${label}: неизвестное свойство "${p}"`);
  }
  const [oneHand, twoHands = null] = data.damage.split("/");
  if (twoHands && !list.includes("versatile")) throw new Error(`${label}: два кубика урона только у универсального оружия`);
  if (list.includes("versatile") && !twoHands) throw new Error(`${label}: универсальное оружие — два кубика урона через /`);
  const needsRange = list.includes("thrown") || list.includes("ranged") || list.includes("reach");
  if (needsRange && !data.range) throw new Error(`${label}: нужна дистанция range`);
  if (!needsRange && data.range) throw new Error(`${label}: range только у метательного, дальнобойного или с досягаемостью`);
  return {
    id,
    name: data.name,
    group: data.group,
    tier: data.tier,
    damage: oneHand,
    damageTwoHands: twoHands,
    type,
    props: list,
    range: data.range ?? null,
    desc,
  };
});

const armor = readDir("armor").map(({ id, label, data, desc }) => {
  if (!slotIds.has(data.slot)) throw new Error(`${label}: неизвестное место "${data.slot}"`);
  const item = { id, name: data.name, slot: data.slot, weight: null, ac: null, desc };
  if (data.slot === "body") {
    if (!weightIds.has(data.weight)) throw new Error(`${label}: неизвестный вес "${data.weight}"`);
    item.weight = data.weight;
  } else if (data.weight) {
    throw new Error(`${label}: вес только у комплекта`);
  }
  if (data.slot === "extra") {
    if (data.ac) throw new Error(`${label}: у детали нет КБ`);
  } else {
    if (!/^\d+$/.test(data.ac ?? "")) throw new Error(`${label}: нужно целое ac`);
    item.ac = Number(data.ac);
  }
  return item;
});

module.exports = { groups, tiers, damageTypes, props, slots, weights, weapons, armor };
