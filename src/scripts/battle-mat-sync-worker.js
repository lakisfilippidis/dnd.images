// Shim для SharedWorker sync-комнаты боевой карты (dice-roller). SharedWorker
// принимает только same-origin URL, а сама библиотека грузится с
// ramil-k.github.io, поэтому страница указывает на этот файл
// (атрибут sync-worker у <battle-toolbar> в base.njk), а он подтягивает
// настоящий код хаба: одно WebSocket-соединение на браузер для всех вкладок.
// URL этого файла стабильный, воркер переживает деплои библиотеки.
importScripts('https://ramil-k.github.io/dice-roller/battle-mat-sync-worker.js');
