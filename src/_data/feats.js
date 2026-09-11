// Черты: общий реестр для страницы /Feats/, страниц классов и личностей.
// Рендер — шорткоды featList / featCards / featPicks в eleventy.config.js.
//
// Сами черты лежат по одной в файле в src/_data/feats/ — обычный markdown,
// чтобы черту мог написать человек без вёрстки: **жирный** и [ссылка](#якорь)
// вместо тегов. Этот файл их собирает и проверяет на сборке.
//
// Порядок карточек задаёт числовой префикс в имени файла (01-training.md):
// он же порядок на /Feats/ и внутри секций при группировке. id черты — имя
// файла без префикса и расширения.
//
// Поле classes задаёт доступность: нет поля — черта общая, её может взять
// персонаж любого класса; список id ([rogue]) — черта классовая; [narrative] —
// черта нарративная: её не выбирают, её выдаёт мастер за историю персонажа.
// Нарративная черта пишется обобщённо (страх чего-то, символ этого страха), а
// конкретика персонажа уходит в заметку featPicks на его странице.
// Необязательное поле side (shadow = Тень, panache = Кураж) даёт карточке третью иконку и класс feat-card--<side>.
const fs = require("node:fs");
const path = require("node:path");
const MarkdownIt = require("markdown-it");

// html: true — в описаниях изредка встречается сырой тег. Полный render (а не
// renderInline) нужен, чтобы черту можно было структурировать: первый абзац —
// образ, дальше механика списком. Потребители заворачивают desc в <div>, а не
// в <p>: блочная разметка внутри <p> невалидна.
const md = new MarkdownIt({ html: true });

const groups = [
  { id: "common", title: "Общие", icon: "compass.svg" },
  { id: "hand", title: "Рука", icon: "hand.svg" },
  { id: "blade", title: "Клинок", icon: "combat-knife.svg" },
  { id: "alchemy", title: "Алхимия", icon: "flask.svg" },
  { id: "ear", title: "Ухо", icon: "ear.svg" },
  { id: "rapier", title: "Шпага", icon: "fencer.svg" },
];

// Тип влияния: на что черта работает в игре
const spheres = [
  { id: "combat", title: "Бой", icon: "sword2.svg" },
  { id: "social", title: "Общение", icon: "interlocution.svg" },
  { id: "infiltration", title: "Вылазка", icon: "magnifier.svg" },
  { id: "growth", title: "Развитие", icon: "dumbbells.svg" },
];

// Доступность: чем черта открывается. Черта без classes — общая, её может
// взять персонаж любого класса; иначе перечислены классы, которым она своя,
// либо narrative — такую черту не выбирают, её выдаёт мастер за отыгрыш.
const classes = [
  { id: "all", title: "Без класса", icon: "person.svg" },
  { id: "rogue", title: "Доступно плуту", icon: "ninja.svg" },
  { id: "narrative", title: "За отыгрыш", icon: "theatre.svg" },
];

const sides = [
  { id: "shadow", title: "Тень", icon: "moon.svg" },
  { id: "panache", title: "Кураж", icon: "sun.svg" },
];

const FEATS_DIR = path.join(__dirname, "feats");

// Простой разбор front matter: значения здесь — скаляры и короткие списки,
// поэтому отдельная зависимость не нужна. Списки пишутся как [a, b].
function parseFrontMatter(raw, file) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`feats/${file}: нет front matter между --- и ---`);
  const data = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const colon = line.indexOf(":");
    if (colon < 1) throw new Error(`feats/${file}: непонятная строка front matter "${line}"`);
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    data[key] = /^\[.*\]$/.test(value)
      ? value.slice(1, -1).split(",").map((v) => v.trim()).filter(Boolean)
      : value;
  }
  return { data, body: match[2].trim() };
}

const groupIds = new Set(groups.map((g) => g.id));
const sphereIds = new Set(spheres.map((s) => s.id));
const classIds = new Set(classes.map((c) => c.id));
const sideIds = new Set(sides.map((s) => s.id));

const files = fs
  .readdirSync(FEATS_DIR)
  .filter((f) => f.endsWith(".md"))
  .sort();

const seen = new Set();
const feats = files.map((file) => {
  const raw = fs.readFileSync(path.join(FEATS_DIR, file), "utf8");
  const { data, body } = parseFrontMatter(raw, file);
  // id — имя файла без числового префикса: переименовал файл, переехала и черта,
  // так что рассинхронизации между id и именем файла быть не может.
  const id = file.replace(/^\d+-/, "").replace(/\.md$/, "");

  if (seen.has(id)) throw new Error(`feats/${file}: черта "${id}" уже есть в другом файле`);
  seen.add(id);
  if (!data.name) throw new Error(`feats/${file}: нет поля name`);
  if (!data.group) throw new Error(`feats/${file}: нет поля group`);
  if (!groupIds.has(data.group)) throw new Error(`feats/${file}: неизвестная группа "${data.group}"`);
  if (data.sphere && !sphereIds.has(data.sphere)) throw new Error(`feats/${file}: неизвестная сфера "${data.sphere}"`);
  if (data.side && !sideIds.has(data.side)) throw new Error(`feats/${file}: неизвестная сторона "${data.side}"`);
  for (const c of data.classes ?? []) {
    if (!classIds.has(c)) throw new Error(`feats/${file}: неизвестная доступность "${c}"`);
  }
  if (!body) throw new Error(`feats/${file}: пустое описание`);

  const feat = { id, name: data.name, group: data.group, desc: md.render(body).trim() };
  if (data.sphere) feat.sphere = data.sphere;
  if (data.classes) feat.classes = data.classes;
  if (data.side) feat.side = data.side;
  feat.req = data.req ?? null;
  return feat;
});

// Требование-ссылка на другую черту: если req называет существующую черту,
// проверяем, что она на месте. Переименование теперь ломает сборку, а не
// оставляет висячее требование, как было с текстовым req.
const byName = new Map(feats.map((f) => [f.name, f]));
for (const feat of feats) {
  if (!feat.req) continue;
  for (const part of feat.req.split(/,\s*|\s+или\s+/)) {
    const name = part.trim();
    if (!name || !byName.has(name)) continue;
    if (byName.get(name).id === feat.id) throw new Error(`feats: черта "${feat.id}" требует саму себя`);
  }
}

module.exports = { groups, spheres, classes, sides, feats };
