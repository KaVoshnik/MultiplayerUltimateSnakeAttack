/**
 * icons.js — система замены иконок-заглушек на арт художника без правки кода.
 *
 * Как это работает:
 * 1. В HTML у каждой иконки есть контейнер:
 *      <span class="menuBtnIcon" data-icon-key="play">
 *        <img src="img/icons/play.png" alt="" class="iconImg" />
 *        <span class="iconFallback">▶</span>
 *      </span>
 * 2. По умолчанию <img> скрыт (см. lobby.css), виден только emoji-заглушка.
 * 3. Если картинка по указанному пути реально существует — она подгружается
 *    и подменяет собой заглушку. Если файла нет (404) — просто остаётся emoji,
 *    ошибок в консоли/на экране не будет.
 * 4. Чтобы включить готовую иконку — художник кладёт файл с ТОЧНО таким же
 *    именем (см. btn.md) в /public/img/icons/. Ничего в HTML/JS менять не нужно.
 */
(function () {
  function bindIcon(img) {
    img.addEventListener("load", () => {
      img.classList.add("loaded");
      const fallback = img.nextElementSibling;
      if (fallback) fallback.classList.add("hidden");
    });
    img.addEventListener("error", () => {
      // Файла ещё нет — тихо остаёмся на emoji-заглушке.
      img.classList.add("failed");
    });
  }

  document.querySelectorAll(".iconImg").forEach(bindIcon);
})();
