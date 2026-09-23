// Ссылка «Поделиться в тг» внизу истории (story.njk, footer.story-share):
// клик не открывает t.me, а копирует адрес ссылки в буфер, чтобы вставить
// его в пост. Если буфер недоступен, ссылка открывается как обычно.
const link = document.querySelector(".story-share-link");
const status = document.querySelector(".story-share-status");

link?.addEventListener("click", async (event) => {
  event.preventDefault();
  try {
    await navigator.clipboard.writeText(link.href);
    showStatus("Ссылка скопирована");
  } catch {
    window.open(link.href, "_blank", "noopener");
  }
});

let timer;
function showStatus(text) {
  if (!status) return;
  status.textContent = text;
  clearTimeout(timer);
  timer = setTimeout(() => { status.textContent = ""; }, 2000);
}
