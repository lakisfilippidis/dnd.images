// Masonry-фоллбек для .home-sections в браузерах без grid-lanes/masonry.
// Карточкам выставляется grid-row-end: span N по фактической высоте.
const grid = document.querySelector(".home-sections");
const force = new URLSearchParams(location.search).has("lanes-fallback");
const native =
  CSS.supports("display", "grid-lanes") ||
  CSS.supports("grid-template-rows", "masonry");

if (grid && (force || !native)) {
  const ROW = 2; // px, мелкий трек — точность раскладки

  const layout = () => {
    // row-gap обнуляется, а просвет закладывается в span: иначе шаг
    // квантования равен ROW + gap и просветы гуляют до 2×gap.
    grid.style.rowGap = "";
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    grid.style.rowGap = "0px";
    grid.style.gridAutoRows = ROW + "px";
    for (const card of grid.children) {
      const h = card.getBoundingClientRect().height;
      card.style.gridRowEnd = "span " + Math.max(1, Math.ceil((h + gap) / ROW));
    }
  };

  const ro = new ResizeObserver(layout);
  for (const card of grid.children) ro.observe(card);
  layout();
}
