// Ссылка «поделиться» внизу истории (story.njk, footer.story-share): клик
// не открывает t.me, а кладёт в буфер ссылку с текстом-названием истории,
// чтобы вставить её в пост одним действием. В буфер идут два формата:
// text/html «<a href=…>название</a>» — его понимают Telegram Desktop и
// редакторы, text/plain «[название](адрес)» — markdown для всего остального.
// Название берётся из data-copy-title, адрес из href.
const link = document.querySelector(".story-share a[data-copy-title]");
const status = document.querySelector(".story-share-status");

link?.addEventListener("click", async (event) => {
  event.preventDefault();
  const title = link.dataset.copyTitle ?? "";
  const url = link.href;
  const html = `<a href="${url}">${title}</a>`;
  const plain = `[${title}](${url})`;
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([plain], { type: "text/plain" }),
        }),
      ]);
    } else {
      await navigator.clipboard.writeText(plain);
    }
    showStatus("Ссылка скопирована");
  } catch {
    // буфер недоступен (http без localhost, запрет в браузере): ведём себя
    // как обычная ссылка
    window.open(url, "_blank", "noopener");
  }
});

let timer;
function showStatus(text) {
  if (!status) return;
  status.textContent = text;
  clearTimeout(timer);
  timer = setTimeout(() => { status.textContent = ""; }, 2000);
}
