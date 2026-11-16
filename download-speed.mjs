// Замер скорости скачивания: 10 последовательных запросов к одному URL.
// Единицы: объём — МБ (10^6 байт), время — секунды, скорость — Мбит/с (10^6 бит/с).

const REQUESTS = 10;
const BYTES_IN_MB = 1_000_000;

function usage() {
  console.error('Использование: node download-speed.mjs <URL>');
  console.error('Пример:        node download-speed.mjs https://example.com/big-image.jpg');
}

function parseUrl(raw) {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

// Один запрос: возвращает { bytes, ms } после полного чтения тела ответа.
async function measureOnce(url) {
  const t0 = performance.now();
  const response = await fetch(url, {
    headers: {
      // Без сжатия — считаем реальные байты, пришедшие по сети.
      'Accept-Encoding': 'identity',
      // Просим не отдавать ответ из промежуточных кэшей.
      'Cache-Control': 'no-cache',
    },
    redirect: 'follow',
  });

  if (!response.ok) {
    // Освобождаем соединение, тело нам не нужно.
    await response.body?.cancel();
    throw new Error(`сервер ответил ${response.status} ${response.statusText}`);
  }

  let bytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
    }
  }

  const ms = performance.now() - t0;
  return { bytes, ms };
}

const fmt = (n, digits) => n.toFixed(digits);

// fetch прячет сетевую причину в err.cause (иногда AggregateError с пустым message).
function describeError(err) {
  const cause = err.cause;
  const parts = [cause?.code, cause?.message, cause?.errors?.[0]?.message].filter(Boolean);
  return parts.length ? `${err.message}: ${[...new Set(parts)].join(' — ')}` : err.message;
}

async function main() {
  const url = parseUrl(process.argv[2]);
  if (!url) {
    usage();
    process.exitCode = 1;
    return;
  }

  console.log(`URL: ${url.href}`);
  console.log(`Запросов: ${REQUESTS} (последовательно)\n`);

  let totalBytes = 0;
  let totalMs = 0;

  for (let i = 1; i <= REQUESTS; i++) {
    let result;
    try {
      result = await measureOnce(url);
    } catch (err) {
      const reason = describeError(err);
      console.error(`Запрос #${i} не удался: ${reason}`);
      process.exitCode = 1;
      return;
    }
    totalBytes += result.bytes;
    totalMs += result.ms;
    console.log(
      `#${String(i).padStart(2)}  ${fmt(result.bytes / BYTES_IN_MB, 2).padStart(9)} МБ  ` +
        `${fmt(result.ms / 1000, 3).padStart(8)} с`,
    );
  }

  const totalSec = totalMs / 1000;
  const avgSec = totalSec / REQUESTS;
  const totalMB = totalBytes / BYTES_IN_MB;
  const mbitPerSec = totalSec > 0 ? (totalBytes * 8) / BYTES_IN_MB / totalSec : 0;
  const mbytePerSec = totalSec > 0 ? totalMB / totalSec : 0;

  console.log('\nИтого:');
  console.log(`  Среднее время запроса: ${fmt(avgSec, 3)} с`);
  console.log(`  Общий объём:           ${fmt(totalMB, 2)} МБ`);
  console.log(`  Скорость скачивания:   ${fmt(mbitPerSec, 2)} Мбит/с (${fmt(mbytePerSec, 2)} МБ/с)`);
}

main();
