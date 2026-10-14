// Karmis AI: бот техпідтримки для Telegram.
// Працює на Cloudflare Workers (безкоштовно), без залежностей. Код живе на GitHub і сам викочується через Actions.
//
// Як це працює:
//   користувач пише боту → бот пересилає повідомлення в чат підтримки (твій особистий чат або закрита група);
//   ти відповідаєш через Reply на це повідомлення → бот надсилає відповідь користувачу.
//   /ban і /unban (теж через Reply) блокують і розблоковують спамера.

// ----------------------------- ТЕКСТИ: редагуй під себе -----------------------------
const CONFIG = {
  welcome:
    'Привіт! Це підтримка Кармис AI 👋\n\n' +
    'Обери питання нижче або просто напиши свою проблему одним-двома повідомленнями. ' +
    'Можна додати скріншот чи відео, так я розберусь швидше.',
  write: 'Напиши свою проблему тут, у чаті. Додай, будь ласка: що робив, що очікував і що вийшло, та версію Кармиса (Windows чи Android). Скріншоти вітаються.',
  banned: 'Вибач, підтримка недоступна для цього акаунта.',
  faq: [
    {
      q: '🔑 Швидко закінчується ліміт API-ключа',
      a: 'У безкоштовних ключів є ліміти за хвилину й за добу.\n\n' +
        '1) У Налаштуваннях встав кілька ключів через кому: коли в одного закінчиться ліміт, Кармис візьме наступний.\n' +
        '2) Для керування екраном став режим «Авто» або «Лише текстом»: так витрачається у рази менше токенів.\n' +
        '3) Додай ключі від різних провайдерів (Gemini, Groq, Mistral, GitHub Models).',
    },
    {
      q: '📱 Керування телефоном не вмикається',
      a: 'Потрібно один раз дозволити:\n\n' +
        '• Налаштування → Спеціальні можливості → Кармис AI → Увімкнути.\n' +
        '• Android 13+: якщо пункт сірий, відкрий Налаштування → Додатки → Кармис AI → ⋮ → «Дозволити обмежені налаштування».\n' +
        '• Для міні-вікна: «Показувати поверх інших додатків».\n\n' +
        'Кнопка «Перевірити» в налаштуваннях Кармиса покаже, чого не вистачає.',
    },
    {
      q: '💻 Керування ноутбуком: «помічник не запустився»',
      a: 'Перший запуск довгий: Windows компілює допоміжний модуль, а антивірус його перевіряє. ' +
        'Зачекай хвилину після старту Кармиса й спробуй ще раз.\n\n' +
        'Якщо не допомогло, натисни «Перевірити» в Налаштуваннях → Керування ноутбуком і надішли мені текст помилки.',
    },
    {
      q: '🎙 Не працює голос або мікрофон',
      a: 'Перевір, що Кармису дозволено мікрофон (Windows: Параметри → Конфіденційність → Мікрофон; Android: дозволи додатка). ' +
        'Для фонового прослуховування на Android має висіти сповіщення «Кармис AI слухає».',
    },
  ],
  adminHelp:
    'Це чат підтримки.\n\n' +
    '• Відповідай через Reply на повідомлення користувача, і відповідь піде йому.\n' +
    '• /ban (Reply) блокує користувача, /unban (Reply) розблоковує.\n' +
    '• Перевірка без другого акаунта: напиши «/test твій текст», це прийде як звернення, і ти зможеш відповісти на нього через Reply.\n' +
    '• Повідомлення зберігаються для відповіді 30 днів.',
};

const TTL = 60 * 60 * 24 * 30;   // скільки днів можна відповісти на повідомлення (секунди)

// ----------------------------- Telegram API -----------------------------
const api = (env, method, body) =>
  fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }).then(r => r.json()).catch(e => ({ ok: false, description: String(e) }));

const say = (env, chat_id, text, extra) => api(env, 'sendMessage', Object.assign({ chat_id, text }, extra || {}));
const react = (env, chat_id, message_id, emoji) =>
  api(env, 'setMessageReaction', { chat_id, message_id, reaction: [{ type: 'emoji', emoji }] });

const menu = () => ({
  reply_markup: {
    inline_keyboard: [
      ...CONFIG.faq.map((f, i) => [{ text: f.q, callback_data: 'faq:' + i }]),
      [{ text: '✍️ Написати в підтримку', callback_data: 'write' }],
    ],
  },
});

// ----------------------------- обробка оновлень -----------------------------
async function handle(u, env) {
  if (u.callback_query) return onCallback(u.callback_query, env);
  const m = u.message;
  if (!m || !m.chat) return;
  if (String(m.chat.id) === String(env.ADMIN_CHAT_ID)) {
    // Перевірка одним акаунтом: «/test текст» у чаті підтримки поводиться як повідомлення від користувача
    const t = m.chat.type === 'private' && /^\/test(@\w+)?\s+([\s\S]+)/i.exec(m.text || '');
    if (t) return onUser(Object.assign({}, m, { text: t[2] }), env);
    return onAdmin(m, env);
  }
  if (m.chat.type !== 'private') return;               // у групах бот мовчить
  return onUser(m, env);
}

async function onCallback(q, env) {
  await api(env, 'answerCallbackQuery', { callback_query_id: q.id });
  const chat = q.message && q.message.chat && q.message.chat.id;
  if (!chat) return;
  if (q.data === 'write') return say(env, chat, CONFIG.write);
  const m = /^faq:(\d+)$/.exec(q.data || '');
  const item = m && CONFIG.faq[Number(m[1])];
  if (!item) return;
  return say(env, chat, item.a + '\n\nНе допомогло? Просто напиши сюди, і я передам у підтримку.');
}

async function onUser(m, env) {
  const uid = m.from.id;
  if (await env.SUPPORT_KV.get('ban:' + uid)) return say(env, m.chat.id, CONFIG.banned);
  if (m.text && /^\/(start|help|faq)(@\w+)?(\s|$)/i.test(m.text)) return say(env, m.chat.id, CONFIG.welcome, menu());

  const name = [m.from.first_name, m.from.last_name].filter(Boolean).join(' ');
  const who = `👤 ${name}${m.from.username ? ' @' + m.from.username : ''} · id ${uid}`;
  const admin = env.ADMIN_CHAT_ID;
  const remember = res => res && res.ok
    ? env.SUPPORT_KV.put('m:' + res.result.message_id, String(uid), { expirationTtl: TTL })
    : null;

  let sent;
  if (m.text) {
    sent = await say(env, admin, `${who}\n\n${m.text}`.slice(0, 4000));
  } else {
    const captionable = m.photo || m.video || m.document || m.audio || m.voice || m.animation;
    if (!captionable) await remember(await say(env, admin, who));   // стікери, кружечки: підпису немає, шлемо окремий рядок
    const extra = captionable ? { caption: (who + (m.caption ? '\n\n' + m.caption : '')).slice(0, 1000) } : {};
    sent = await api(env, 'copyMessage', Object.assign({ chat_id: admin, from_chat_id: m.chat.id, message_id: m.message_id }, extra));
  }
  if (!sent || !sent.ok) return say(env, m.chat.id, 'Не вдалося передати повідомлення в підтримку. Спробуй ще раз трохи пізніше.');
  await remember(sent);
  await react(env, m.chat.id, m.message_id, '👌');       // тиха відповідь «прийнято»
}

async function onAdmin(m, env) {
  const text = (m.text || '').trim();
  const admin = m.chat.id;
  const r = m.reply_to_message;

  if (!r) {
    if (/^\/(start|help)(@\w+)?(\s|$)/i.test(text)) return say(env, admin, CONFIG.adminHelp);
    return;
  }
  const uid = await env.SUPPORT_KV.get('m:' + r.message_id);
  if (!uid) return say(env, admin, 'Не знаю, кому це. Відповідай (Reply) саме на повідомлення від користувача; воно зберігається 30 днів.', { reply_to_message_id: m.message_id });

  if (/^\/ban(@\w+)?(\s|$)/i.test(text)) {
    await env.SUPPORT_KV.put('ban:' + uid, '1');
    return say(env, admin, `🚫 Користувача ${uid} заблоковано.`, { reply_to_message_id: m.message_id });
  }
  if (/^\/unban(@\w+)?(\s|$)/i.test(text)) {
    await env.SUPPORT_KV.delete('ban:' + uid);
    return say(env, admin, `✅ Користувача ${uid} розблоковано.`, { reply_to_message_id: m.message_id });
  }

  const res = await api(env, 'copyMessage', { chat_id: uid, from_chat_id: admin, message_id: m.message_id });
  if (res.ok) return react(env, admin, m.message_id, '👌');
  return say(env, admin, `Не вдалося надіслати: ${res.description || 'невідома помилка'} (можливо, користувач заблокував бота).`, { reply_to_message_id: m.message_id });
}

// ----------------------------- вхідна точка Worker -----------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET') return new Response('Karmis support bot: ok');
    if (request.method !== 'POST' || url.pathname !== '/webhook') return new Response('not found', { status: 404 });
    if (request.headers.get('X-Telegram-Bot-Api-Secret-Token') !== env.WEBHOOK_SECRET) return new Response('forbidden', { status: 403 });
    let update;
    try { update = await request.json(); } catch { return new Response('bad request', { status: 400 }); }
    try { await handle(update, env); } catch (e) { console.error('handler error', e); }   // завжди 200, інакше Telegram повторюватиме запит
    return new Response('ok');
  },
};
