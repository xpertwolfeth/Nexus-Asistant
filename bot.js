// ─── Зависимости ───────────────────────────────────────────────────────────
const TelegramBot = require("node-telegram-bot-api");
const Groq        = require("groq-sdk");
const axios       = require("axios");
const XLSX        = require("xlsx");
const express     = require("express");
const fs          = require("fs");
const path        = require("path");

// ─── Переменные окружения ───────────────────────────────────────────────────
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY   = process.env.GROQ_API_KEY;
const PORT           = process.env.PORT || 3000;
const DB_FILE        = path.join("/tmp", "db.json");

// ─── Инициализация ──────────────────────────────────────────────────────────
const bot  = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const groq = new Groq({ apiKey: GROQ_API_KEY });

// HTTP-сервер нужен Render для health-check
const app = express();
app.get("/", (_req, res) => res.send("Bot is running"));
app.listen(PORT, () => console.log("HTTP server on port " + PORT));

// ════════════════════════════════════════════════════════════════════════════
//  ПЕРЕВОДЫ
// ════════════════════════════════════════════════════════════════════════════

const LANG = {
  ru: {
    pickLang:     "🌐 Выберите язык / Tilni tanlang:",
    askName:      "👋 Привет! Я ваш бизнес-ассистент.\n\nКак вас зовут?",
    metName:      (n) => `Приятно познакомиться, *${n}*! 👋\n\nДавайте сразу заполним вашу базу контактов — это поможет мне тегать людей в группе и напоминать о задачах.\n\n👤 Введите имя первого контакта:`,
    crmAskUser:   (n) => `✅ Контакт: *${n}*\n\n📱 Telegram @username (или напишите "нет"):`,
    crmAskPhone:  (u) => `✅ Username: ${u || "—"}\n\n📞 Номер телефона (или "нет"):`,
    crmAskNote:   (p) => `✅ Телефон: ${p || "—"}\n\n📝 Заметка: должность, компания, о чём договорились (или "нет"):`,
    crmSaved:     (c) => `🎉 Контакт сохранён!\n\n👤 *${c.name}*\n📱 ${c.username || "—"}\n📞 ${c.phone || "—"}\n📝 ${c.note || "—"}\n\nДобавить ещё контакт? Введите имя или нажмите кнопку:`,
    crmMoreBtn:   "➕ Ещё контакт",
    crmDoneBtn:   "✅ Готово",
    noContacts:   "📭 *База контактов пуста*\n\nДобавьте контакт:\n/newclient",
    contactsList: "👥 *База контактов:*\n\n",
    contactsHint: "\n_/newclient — добавить | /delclient N — удалить_",
    clientDel:    (n) => `🗑 Контакт *${n}* удалён.`,
    clientNF:     "❌ Контакт не найден.",
    dashHead:     (n, d, t) => `👋 *${n}*, добрый день!\n📅 ${d} · 🕐 ${t}\n${"─".repeat(22)}\n\n`,
    tasksHead:    (c) => `📋 *Задачи (${c}):*\n`,
    tasksEmpty:   "_нет задач_\n",
    tasksHint:    "_/add 14:30 Название — добавить_\n\n",
    cliHead:      (c) => `👥 *Контакты (${c}):*\n`,
    cliEmpty:     "_пусто_\n",
    cliMore:      (n) => `_...ещё ${n}_\n`,
    grpLine:      (t) => `🔗 *Группа:* ${t}\n`,
    modeLabel:    "Выберите режим:",
    modeOk:       (l) => `Режим: *${l}* ✅`,
    histOk:       "История очищена ✅",
    taskOk:       (n, t, tm) => `✅ Задача #${n}: _${t}_` + (tm ? `\n⏰ *${tm}* — напомню за 1 час!` : ""),
    taskDone:     (t) => `🎉 Выполнено: _${t}_`,
    taskDel:      (t) => `🗑 Удалено: _${t}_`,
    taskNF:       "❌ Задача не найдена.",
    remindSet:    (m, t) => `⏰ Напомню через *${m} мин*:\n_${t}_`,
    remindFire:   (t) => `⏰ *Напоминание!*\n\n${t}`,
    remind60:     (t, tm) => `⏰ *Через 1 час:*\n📌 *${t}*  🕐 ${tm}\n_Подготовьтесь заранее!_`,
    remindNow:    (t, tm) => `🔔 *Пора!*\n\n📌 *${t}*  🕐 ${tm}`,
    remindBad:    "❌ Укажите 1–1440 минут.",
    voiceWait:    "🎤 Распознаю...",
    voiceSaid:    (t) => `🎤 *Вы сказали:* _${t}_\n\n⏳ Думаю...`,
    voiceErr:     "❌ Не удалось распознать голос.",
    fileRead:     (n) => `📁 Читаю *${n}*...`,
    fileAna:      "📊 Анализирую...",
    fileRes:      (n) => `📁 *${n}*\n\n`,
    fileErr:      "❌ Ошибка чтения файла.",
    fileNo:       "📎 Поддерживаю только .xlsx .xls .csv",
    sheetLoad:    "📊 Загружаю таблицу...",
    sheetAna:     "🔍 Анализирую...",
    sheetRes:     "📊 *Google Таблица*\n\n",
    sheetErr:     "❌ Не удалось загрузить. Убедитесь что таблица открыта.",
    noGroup:      "❌ Группа не привязана.\n\nДобавьте бота в группу → /linkgroup",
    cliNoUser:    (n) => `❌ У *${n}* нет @username. Обновите через /newclient`,
    tagNF:        (n) => `❓ Контакт *${n}* не найден.\n/newclient — добавить`,
    tagSent:      (u, m) => `✅ Отправлено!\n📤 *${u}* — ${m}`,
    tagErr:       "❌ Не удалось отправить в группу.",
    grpLinked:    (t) => `✅ Группа *${t}* привязана!\n\nПишите мне:\n_"спроси у Шомахсуда готова ли инфографика"_`,
    grpNone:      "❌ Бот не добавлен ни в одну группу.\n\nДобавьте бота в группу → /linkgroup",
    grpChoose:    "Выберите группу:",
    langOk:       "✅ Язык — Русский",
    help: `*Возможности:*\n\n*Режимы:*\n🤖 Бизнес · 💡 Идеи · ✏️ Тексты\n📈 Аналитик · ⚖️ Законы · 🧮 Бухгалтер · ⏰ Тайм\n\n*Задачи:*\n/add 14:30 Встреча — добавить (напомню за 1 час)\n/done 1 · /del 2 · /remind 30 Текст\n\n*Контакты:*\n/newclient · /clients · /delclient N\n\n*Группа:*\n/linkgroup — привязать\n_"спроси у Имя..."_ — тегнуть\n\n*Файлы:* .xlsx .csv · Google Sheets\n*Голос:* 🎤\n*Язык:* /lang`,
    analyzeQ:     "Проанализируй таблицу: показатели, тренды, аномалии, рекомендации.",
    timeHint:     "\n\n💡 _/add ЧЧ:ММ Задача_",
    no:           ["нет", "no", "yo'q", "yoq"],
    kb: [
      ["🤖 Бизнес",  "💡 Идеи",    "✏️ Тексты"],
      ["📈 Аналитик","⚖️ Законы",  "🧮 Бухгалтер"],
      ["⏰ Тайм",    "👥 Контакты"],
      ["📋 Задачи",  "🔄 Сброс",   "❓ Помощь"],
    ],
    modeMap: {
      "🤖 Бизнес":"general","💡 Идеи":"brainstorm","✏️ Тексты":"text",
      "📈 Аналитик":"analyst","⚖️ Законы":"law","🧮 Бухгалтер":"accountant","⏰ Тайм":"time",
    },
    btn: { contacts:"👥 Контакты", tasks:"📋 Задачи", help:"❓ Помощь", reset:"🔄 Сброс" },
  },

  uz: {
    pickLang:     "🌐 Выберите язык / Tilni tanlang:",
    askName:      "👋 Salom! Men sizning biznes yordamchingizman.\n\nIsмingiz nima?",
    metName:      (n) => `Tanishganimdan xursandman, *${n}*! 👋\n\nKeling, kontaktlar bazasini to'ldiramiz — guruhda teglayman va vazifalarni eslataman.\n\n👤 Birinchi kontakt ismini kiriting:`,
    crmAskUser:   (n) => `✅ Kontakt: *${n}*\n\n📱 Telegram @username ("yo'q" — yo'q bo'lsa):`,
    crmAskPhone:  (u) => `✅ Username: ${u || "—"}\n\n📞 Telefon raqami ("yo'q" — yo'q bo'lsa):`,
    crmAskNote:   (p) => `✅ Telefon: ${p || "—"}\n\n📝 Eslatma: lavozim, kompaniya ("yo'q" — yo'q bo'lsa):`,
    crmSaved:     (c) => `🎉 Kontakt saqlandi!\n\n👤 *${c.name}*\n📱 ${c.username || "—"}\n📞 ${c.phone || "—"}\n📝 ${c.note || "—"}\n\nYana kontakt qo'shish? Ism kiriting yoki tugma bosing:`,
    crmMoreBtn:   "➕ Yana kontakt",
    crmDoneBtn:   "✅ Tayyor",
    noContacts:   "📭 *Kontaktlar bazasi bo'sh*\n\n/newclient — qo'shish",
    contactsList: "👥 *Kontaktlar:*\n\n",
    contactsHint: "\n_/newclient — qo'shish | /delclient N — o'chirish_",
    clientDel:    (n) => `🗑 *${n}* o'chirildi.`,
    clientNF:     "❌ Kontakt topilmadi.",
    dashHead:     (n, d, t) => `👋 *${n}*, xayrli kun!\n📅 ${d} · 🕐 ${t}\n${"─".repeat(22)}\n\n`,
    tasksHead:    (c) => `📋 *Vazifalar (${c}):*\n`,
    tasksEmpty:   "_vazifa yo'q_\n",
    tasksHint:    "_/add 14:30 Nom — qo'shish_\n\n",
    cliHead:      (c) => `👥 *Kontaktlar (${c}):*\n`,
    cliEmpty:     "_bo'sh_\n",
    cliMore:      (n) => `_...yana ${n} ta_\n`,
    grpLine:      (t) => `🔗 *Guruh:* ${t}\n`,
    modeLabel:    "Rejimni tanlang:",
    modeOk:       (l) => `Rejim: *${l}* ✅`,
    histOk:       "Tarix tozalandi ✅",
    taskOk:       (n, t, tm) => `✅ Vazifa #${n}: _${t}_` + (tm ? `\n⏰ *${tm}* — 1 soat oldin eslataman!` : ""),
    taskDone:     (t) => `🎉 Bajarildi: _${t}_`,
    taskDel:      (t) => `🗑 O'chirildi: _${t}_`,
    taskNF:       "❌ Vazifa topilmadi.",
    remindSet:    (m, t) => `⏰ *${m} daqiqadan* keyin:\n_${t}_`,
    remindFire:   (t) => `⏰ *Eslatma!*\n\n${t}`,
    remind60:     (t, tm) => `⏰ *1 soat qoldi:*\n📌 *${t}*  🕐 ${tm}\n_Tayyorlaning!_`,
    remindNow:    (t, tm) => `🔔 *Vaqt keldi!*\n\n📌 *${t}*  🕐 ${tm}`,
    remindBad:    "❌ 1–1440 daqiqa kiriting.",
    voiceWait:    "🎤 Taniyapman...",
    voiceSaid:    (t) => `🎤 *Siz:* _${t}_\n\n⏳ O'ylamoqdaman...`,
    voiceErr:     "❌ Ovozni tanib bo'lmadi.",
    fileRead:     (n) => `📁 O'qimoqdaman *${n}*...`,
    fileAna:      "📊 Tahlil qilmoqdaman...",
    fileRes:      (n) => `📁 *${n}*\n\n`,
    fileErr:      "❌ Faylni o'qishda xato.",
    fileNo:       "📎 Faqat .xlsx .xls .csv",
    sheetLoad:    "📊 Yuklamoqdaman...",
    sheetAna:     "🔍 Tahlil...",
    sheetRes:     "📊 *Google Jadval*\n\n",
    sheetErr:     "❌ Yuklab bo'lmadi. Jadval ochiq bo'lsin.",
    noGroup:      "❌ Guruh ulanmagan.\n\nBotni guruhga qo'shing → /linkgroup",
    cliNoUser:    (n) => `❌ *${n}* ning @username yo'q. /newclient orqali yangilang`,
    tagNF:        (n) => `❓ *${n}* topilmadi.\n/newclient — qo'shish`,
    tagSent:      (u, m) => `✅ Yuborildi!\n📤 *${u}* — ${m}`,
    tagErr:       "❌ Guruhga yubora olmadi.",
    grpLinked:    (t) => `✅ *${t}* guruhi ulandi!\n\nYozing:\n_"Shomaxsuddan infografika tayyor bo'ldimi deb so'ra"_`,
    grpNone:      "❌ Bot hech bir guruhga qo'shilmagan.\n\nBotni guruhga qo'shing → /linkgroup",
    grpChoose:    "Guruhni tanlang:",
    langOk:       "✅ Til — O'zbek",
    help: `*Imkoniyatlar:*\n\n*Rejimlar:*\n🤖 Biznes · 💡 G'oyalar · ✏️ Matnlar\n📈 Tahlilchi · ⚖️ Qonunlar · 🧮 Hisobchi · ⏰ Vaqt\n\n*Vazifalar:*\n/add 14:30 Uchrashuv — qo'shish (1 soat oldin eslatadi)\n/done 1 · /del 2 · /remind 30 Matn\n\n*Kontaktlar:*\n/newclient · /clients · /delclient N\n\n*Guruh:*\n/linkgroup — ulash\n_"Shomaxsuddan so'ra..."_ — teglash\n\n*Fayllar:* .xlsx .csv · Google Sheets\n*Ovoz:* 🎤\n*Til:* /lang`,
    analyzeQ:     "Jadvalni tahlil qil: ko'rsatkichlar, trendlar, anomaliyalar, tavsiyalar.",
    timeHint:     "\n\n💡 _/add SS:DD Vazifa_",
    no:           ["нет", "no", "yo'q", "yoq"],
    kb: [
      ["🤖 Biznes",   "💡 G'oyalar",  "✏️ Matnlar"],
      ["📈 Tahlilchi","⚖️ Qonunlar", "🧮 Hisobchi"],
      ["⏰ Vaqt",     "👥 Kontaktlar"],
      ["📋 Vazifalar","🔄 Tozalash",  "❓ Yordam"],
    ],
    modeMap: {
      "🤖 Biznes":"general","💡 G'oyalar":"brainstorm","✏️ Matnlar":"text",
      "📈 Tahlilchi":"analyst","⚖️ Qonunlar":"law","🧮 Hisobchi":"accountant","⏰ Vaqt":"time",
    },
    btn: { contacts:"👥 Kontaktlar", tasks:"📋 Vazifalar", help:"❓ Yordam", reset:"🔄 Tozalash" },
  },
};

function T(chatId) {
  const u = getUser(chatId);
  return LANG[u.lang || "ru"];
}
function kb(chatId) {
  return { reply_markup: { keyboard: T(chatId).kb, resize_keyboard: true } };
}

// ════════════════════════════════════════════════════════════════════════════
//  AI РЕЖИМЫ
// ════════════════════════════════════════════════════════════════════════════

function getModes(lang) {
  const uz = lang === "uz";
  const L  = uz ? "o'zbek tilida" : "на русском языке";
  return {
    general:    { label: uz ? "🤖 Biznes"    : "🤖 Бизнес",    system: `Tajribali biznes yordamchisi. Qisqa, aniq, ${L}.` },
    brainstorm: { label: uz ? "💡 G'oyalar"  : "💡 Идеи",      system: `Ijodiy biznes strateg. Raqamlangan g'oyalar, ${L}.` },
    text:       { label: uz ? "✏️ Matnlar"   : "✏️ Тексты",    system: `Professional biznes kopirayter. Xatlar, shartnomalar, postlar, ${L}.` },
    analyst:    { label: uz ? "📈 Tahlilchi" : "📈 Аналитик",  system: `Moliyaviy tahlilchi. KPI, ROI, EBITDA, prognozlar, ${L}.` },
    law:        { label: uz ? "⚖️ Qonunlar"  : "⚖️ Законы",    system: `O'zbekiston huquqshunosi. Konstitutsiya, Soliq kodeksi (QQS 12%, foyda solig'i 15%, JSHDS 12%, ijt.soliq 12%, INPS 0.1%, aylanma solig'i 4%), Mehnat va Fuqarolik kodeksi. Modda raqamlarini keltir. ${L}.` },
    accountant: { label: uz ? "🧮 Hisobchi"  : "🧮 Бухгалтер", system: `O'zbekiston buxgalteri. Stavkalar: QQS 12%, foyda solig'i 15%, JSHDS 12%, ijt.soliq 12%, INPS 0.1%. Ish haqi: INPS=X*0.001, JSHDS=(X-INPS)*0.12, Qo'lga=X-INPS-JSHDS, Ijt=X*0.12. Formulalar ko'rsat. ${L}.` },
    time:       { label: uz ? "⏰ Vaqt"      : "⏰ Тайм",      system: `Vaqt menejment eksperti. Eyzenxauer matritsasi, Time Blocking, Pomodoro 25+5, Pareto 80/20. Soatma-soat kun rejasi tuz. ${L}.` },
  };
}

// ════════════════════════════════════════════════════════════════════════════
//  БАЗА ДАННЫХ
// ════════════════════════════════════════════════════════════════════════════

function loadDB() {
  try { if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch (_) {}
  return { users: {}, groups: {} };
}
function saveDB(db) {
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (_) {}
}
function getUser(id) {
  const db = loadDB();
  if (!db.users[id]) {
    db.users[id] = { lang: null, name: null, mode: "general", history: [], tasks: [], clients: [], groupId: null, ready: false };
    saveDB(db);
  }
  return db.users[id];
}
function saveUser(id, u) { const db = loadDB(); db.users[id] = u; saveDB(db); }
function saveGroup(id, d) { const db = loadDB(); db.groups[id] = d; saveDB(db); }
function getGroups()      { return loadDB().groups || {}; }

// ════════════════════════════════════════════════════════════════════════════
//  ВСПОМОГАТЕЛЬНЫЕ
// ════════════════════════════════════════════════════════════════════════════

async function sendLong(chatId, text) {
  const opts = { parse_mode: "Markdown", ...kb(chatId) };
  if (text.length <= 4000) return bot.sendMessage(chatId, text, opts);
  for (let i = 0; i < text.length; i += 4000)
    await bot.sendMessage(chatId, text.slice(i, i + 4000), opts);
}

async function ai(chatId, msg, ctx = "") {
  const u   = getUser(chatId);
  const sys = getModes(u.lang || "ru")[u.mode || "general"].system;
  const body = ctx ? ctx + "\n\n" + msg : msg;
  const h   = u.history || [];
  h.push({ role: "user", content: body });
  if (h.length > 20) h.splice(0, h.length - 20);
  const r = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile", max_tokens: 1500,
    messages: [{ role: "system", content: sys }, ...h],
  });
  const reply = r.choices[0].message.content;
  h.push({ role: "assistant", content: reply });
  u.history = h;
  saveUser(chatId, u);
  return reply;
}

function parseTime(s) {
  const m = s.match(/(\d{1,2})[:.:](\d{2})/);
  if (!m) return null;
  const h = +m[1], min = +m[2];
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

function pad(n) { return String(n).padStart(2, "0"); }

// ════════════════════════════════════════════════════════════════════════════
//  ОНБОРДИНГ
// ════════════════════════════════════════════════════════════════════════════

const waitingName = new Set();
const waitingCRM  = new Map(); // chatId → { step, name, username, phone }

function showLangPicker(chatId) {
  bot.sendMessage(chatId, LANG.ru.pickLang, {
    reply_markup: { inline_keyboard: [
      [{ text: "🇷🇺 Русский",      callback_data: "lang_ru" }],
      [{ text: "🇺🇿 O'zbek tili",  callback_data: "lang_uz" }],
    ]},
  });
}

function showDashboard(chatId) {
  const t = T(chatId);
  const u = getUser(chatId);
  const now = new Date();
  const d = `${pad(now.getDate())}.${pad(now.getMonth()+1)}.${now.getFullYear()}`;
  const tm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const tasks = (u.tasks || []).filter(x => !x.done)
    .sort((a,b) => { if (a.time && b.time) return a.time.localeCompare(b.time); return a.time ? -1 : 1; });
  const clients = u.clients || [];

  let txt = t.dashHead(u.name, d, tm);
  txt += t.tasksHead(tasks.length);
  if (!tasks.length) { txt += t.tasksEmpty; }
  else tasks.forEach((tk, i) => { txt += `${i+1}. ${tk.time ? "🕐 "+tk.time+" " : ""}${tk.text}\n`; });
  txt += t.tasksHint;

  txt += t.cliHead(clients.length);
  if (!clients.length) { txt += t.cliEmpty; }
  else {
    clients.slice(0,5).forEach(c => { txt += `• ${c.name}${c.username?" "+c.username:""}${c.phone?" · "+c.phone:""}\n`; });
    if (clients.length > 5) txt += t.cliMore(clients.length - 5);
  }

  if (u.groupId) {
    const g = getGroups()[u.groupId];
    if (g) txt += "\n" + t.grpLine(g.title);
  }

  txt += "\n" + t.modeLabel;
  bot.sendMessage(chatId, txt, { parse_mode: "Markdown", ...kb(chatId) });
}

bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  const u  = getUser(id);
  if (!u.lang) return showLangPicker(id);
  if (!u.ready) { waitingName.add(id); return bot.sendMessage(id, T(id).askName, { reply_markup: { remove_keyboard: true } }); }
  showDashboard(id);
});

bot.onText(/\/lang/, (msg) => showLangPicker(msg.chat.id));

// ════════════════════════════════════════════════════════════════════════════
//  КОНТАКТЫ (CRM)
// ════════════════════════════════════════════════════════════════════════════

function startCRM(chatId) {
  waitingCRM.set(chatId, { step: "name" });
  bot.sendMessage(chatId, T(chatId).metName("").split("\n\n").pop(), { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } });
  // Точнее: просим просто имя контакта
  const t = T(chatId);
  bot.sendMessage(chatId, "👤 " + (chatId ? (t === LANG.ru ? "Введите имя контакта:" : "Kontakt ismini kiriting:") : ""), { reply_markup: { remove_keyboard: true } });
}

function startCRMAfterGreet(chatId) {
  waitingCRM.set(chatId, { step: "name" });
  bot.sendMessage(chatId, T(chatId) === LANG.uz
    ? "👤 Birinchi kontakt ismini kiriting:"
    : "👤 Введите имя первого контакта:",
    { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } }
  );
}

async function handleCRM(chatId, text) {
  const step = waitingCRM.get(chatId);
  if (!step) return false;
  const t  = T(chatId);
  const no = (s) => t.no.includes(s.toLowerCase().trim());

  if (step.step === "name") {
    step.name = text; step.step = "username";
    bot.sendMessage(chatId, t.crmAskUser(text), { parse_mode: "Markdown" });
    return true;
  }
  if (step.step === "username") {
    step.username = no(text) ? null : (text.startsWith("@") ? text : "@" + text);
    step.step = "phone";
    bot.sendMessage(chatId, t.crmAskPhone(step.username), { parse_mode: "Markdown" });
    return true;
  }
  if (step.step === "phone") {
    step.phone = no(text) ? null : text;
    step.step = "note";
    bot.sendMessage(chatId, t.crmAskNote(step.phone), { parse_mode: "Markdown" });
    return true;
  }
  if (step.step === "note") {
    step.note = no(text) ? null : text;
    waitingCRM.delete(chatId);
    const u = getUser(chatId);
    u.clients = u.clients || [];
    const c = { id: Date.now(), name: step.name, username: step.username, phone: step.phone, note: step.note };
    u.clients.push(c);
    saveUser(chatId, u);
    bot.sendMessage(chatId, t.crmSaved(c), {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [
        [{ text: t.crmMoreBtn, callback_data: "crm_more" }],
        [{ text: t.crmDoneBtn, callback_data: "crm_done" }],
      ]},
    });
    return true;
  }
  return false;
}

function showContacts(chatId) {
  const t = T(chatId);
  const u = getUser(chatId);
  const cl = u.clients || [];
  if (!cl.length) return bot.sendMessage(chatId, t.noContacts, { parse_mode: "Markdown", ...kb(chatId) });
  let txt = t.contactsList;
  cl.forEach((c, i) => {
    txt += `*${i+1}. ${c.name}*\n`;
    if (c.username) txt += `   📱 ${c.username}\n`;
    if (c.phone)    txt += `   📞 ${c.phone}\n`;
    if (c.note)     txt += `   📝 ${c.note}\n`;
    txt += "\n";
  });
  txt += t.contactsHint;
  sendLong(chatId, txt);
}

bot.onText(/\/newclient/, (msg) => {
  const id = msg.chat.id;
  waitingCRM.set(id, { step: "name" });
  const t = T(id);
  bot.sendMessage(id, t === LANG.uz ? "👤 Kontakt ismini kiriting:" : "👤 Введите имя контакта:", { reply_markup: { remove_keyboard: true } });
});
bot.onText(/\/clients/, (msg) => showContacts(msg.chat.id));
bot.onText(/\/delclient (\d+)/, (msg, match) => {
  const id = msg.chat.id; const t = T(id);
  const u = getUser(id); const i = +match[1] - 1;
  if (!u.clients || i < 0 || i >= u.clients.length) return bot.sendMessage(id, t.clientNF, kb(id));
  const name = u.clients.splice(i, 1)[0].name;
  saveUser(id, u);
  bot.sendMessage(id, t.clientDel(name), { parse_mode: "Markdown", ...kb(id) });
});

// ════════════════════════════════════════════════════════════════════════════
//  ЗАДАЧИ
// ════════════════════════════════════════════════════════════════════════════

bot.onText(/\/add (.+)/, (msg, match) => {
  const id = msg.chat.id; const t = T(id);
  const u = getUser(id);
  u.tasks = u.tasks || [];
  const raw = match[1].trim();
  const tm = raw.match(/^(\d{1,2}[:.]\d{2})\s+(.*)/);
  let text, time;
  if (tm) { const p = parseTime(tm[1]); if (p) { time = pad(p.h)+":"+pad(p.m); text = tm[2]; } else text = raw; }
  else text = raw;
  u.tasks.push({ id: Date.now(), text, time: time||null, done: false, r60: false, r0: false });
  saveUser(id, u);
  bot.sendMessage(id, t.taskOk(u.tasks.length, text, time), { parse_mode: "Markdown", ...kb(id) });
});

bot.onText(/\/done (\d+)/, (msg, match) => {
  const id = msg.chat.id; const t = T(id); const u = getUser(id); const i = +match[1]-1;
  if (!u.tasks || i < 0 || i >= u.tasks.length) return bot.sendMessage(id, t.taskNF, kb(id));
  u.tasks[i].done = true; saveUser(id, u);
  bot.sendMessage(id, t.taskDone(u.tasks[i].text), { parse_mode: "Markdown", ...kb(id) });
});

bot.onText(/\/del (\d+)/, (msg, match) => {
  const id = msg.chat.id; const t = T(id); const u = getUser(id); const i = +match[1]-1;
  if (!u.tasks || i < 0 || i >= u.tasks.length) return bot.sendMessage(id, t.taskNF, kb(id));
  const name = u.tasks.splice(i,1)[0].text; saveUser(id, u);
  bot.sendMessage(id, t.taskDel(name), { parse_mode: "Markdown", ...kb(id) });
});

bot.onText(/\/remind (\d+) (.+)/, (msg, match) => {
  const id = msg.chat.id; const t = T(id);
  const min = +match[1]; const txt = match[2].trim();
  if (min < 1 || min > 1440) return bot.sendMessage(id, t.remindBad, kb(id));
  setTimeout(() => bot.sendMessage(id, t.remindFire(txt), { parse_mode: "Markdown", ...kb(id) }), min * 60000);
  bot.sendMessage(id, t.remindSet(min, txt), { parse_mode: "Markdown", ...kb(id) });
});

function showTasks(chatId) {
  const t = T(chatId); const u = getUser(chatId);
  const tasks = u.tasks || [];
  if (!tasks.length) return bot.sendMessage(chatId, t === LANG.uz
    ? "📋 *Vazifalar yo'q*\n\n/add 14:30 Uchrashuv" : "📋 *Задач нет*\n\n/add 14:30 Встреча",
    { parse_mode: "Markdown", ...kb(chatId) });
  let txt = "";
  const pending = tasks.filter(x => !x.done);
  const done    = tasks.filter(x => x.done);
  if (pending.length) { txt += `📋 *${pending.length}:*\n`; tasks.forEach((tk,i) => { if (!tk.done) txt += `${i+1}. ${tk.time?"🕐 "+tk.time+" ":""}${tk.text}\n`; }); }
  if (done.length)    { txt += `\n✅ *${done.length}:*\n`; tasks.forEach((tk,i) => { if (tk.done) txt += `${i+1}. ~${tk.text}~\n`; }); }
  txt += "\n_/done N · /del N_";
  sendLong(chatId, txt);
}

// Авто-напоминания каждую минуту
setInterval(() => {
  const db = loadDB();
  const now = new Date();
  const nowM = now.getHours()*60 + now.getMinutes();
  Object.entries(db.users).forEach(([id, u]) => {
    if (!u.tasks) return;
    const t = LANG[u.lang || "ru"];
    let changed = false;
    u.tasks.forEach(tk => {
      if (tk.done || !tk.time) return;
      const p = parseTime(tk.time); if (!p) return;
      const diff = (p.h*60+p.m) - nowM;
      if (diff === 60 && !tk.r60) { bot.sendMessage(id, t.remind60(tk.text, tk.time), { parse_mode:"Markdown" }); tk.r60 = true; changed = true; }
      if (diff === 0  && !tk.r0)  { bot.sendMessage(id, t.remindNow(tk.text, tk.time), { parse_mode:"Markdown" }); tk.r0  = true; changed = true; }
    });
    if (changed) db.users[id] = u;
  });
  try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch(_) {}
}, 60000);

// ════════════════════════════════════════════════════════════════════════════
//  ГРУППЫ И ТЕГИНГ
// ════════════════════════════════════════════════════════════════════════════

bot.on("my_chat_member", (upd) => {
  const c = upd.chat;
  if ((c.type==="group"||c.type==="supergroup") && ["member","administrator"].includes(upd.new_chat_member?.status))
    saveGroup(String(c.id), { id: c.id, title: c.title });
});

bot.onText(/\/linkgroup/, (msg) => {
  const id = msg.chat.id; const t = T(id);
  const gs = Object.values(getGroups());
  if (!gs.length) return bot.sendMessage(id, t.grpNone, { parse_mode:"Markdown", ...kb(id) });
  bot.sendMessage(id, t.grpChoose, { reply_markup: { inline_keyboard: gs.map(g => [{ text: g.title, callback_data: "grp_"+g.id }]) } });
});

function parseTag(text) {
  const pp = [
    /(?:спроси\s+у|спроси|ask)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:напомни|remind)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:тегни|отметь|tag|ping)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:so['']ra(?:gin)?)\s+([a-zA-Zа-яёА-ЯЁ]+)(?:\s+dan)?\s+(.+)/i,
  ];
  for (const p of pp) { const m = text.match(p); if (m) return { name: m[1], msg: m[2] }; }
  return null;
}

async function doTag(chatId, req) {
  const t = T(chatId); const u = getUser(chatId);
  if (!u.groupId) return bot.sendMessage(chatId, t.noGroup, { parse_mode:"Markdown", ...kb(chatId) });
  const cl = (u.clients||[]).find(c => c.name.toLowerCase().includes(req.name.toLowerCase()));
  if (!cl)          return bot.sendMessage(chatId, t.tagNF(req.name), { parse_mode:"Markdown", ...kb(chatId) });
  if (!cl.username) return bot.sendMessage(chatId, t.cliNoUser(cl.name), { parse_mode:"Markdown", ...kb(chatId) });
  try {
    await bot.sendMessage(u.groupId, cl.username + ", " + req.msg);
    bot.sendMessage(chatId, t.tagSent(cl.username, req.msg), { parse_mode:"Markdown", ...kb(chatId) });
  } catch (_) { bot.sendMessage(chatId, t.tagErr, kb(chatId)); }
}

// ════════════════════════════════════════════════════════════════════════════
//  ГОЛОС
// ════════════════════════════════════════════════════════════════════════════

async function dlFile(fileId) {
  const info = await bot.getFile(fileId);
  const url  = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${info.file_path}`;
  const ext  = path.extname(info.file_path) || ".bin";
  const tmp  = path.join("/tmp", "f_" + fileId + ext);
  const r    = await axios({ url, responseType: "arraybuffer" });
  fs.writeFileSync(tmp, r.data);
  return tmp;
}

bot.on("voice", async (msg) => {
  const id = msg.chat.id; const t = T(id);
  const st = await bot.sendMessage(id, t.voiceWait);
  bot.sendChatAction(id, "typing");
  try {
    const fp = await dlFile(msg.voice.file_id);
    const tr = await groq.audio.transcriptions.create({ file: fs.createReadStream(fp), model: "whisper-large-v3-turbo", language: getUser(id).lang==="uz"?"uz":"ru", response_format: "text" });
    fs.unlink(fp, ()=>{});
    await bot.editMessageText(t.voiceSaid(tr), { chat_id:id, message_id:st.message_id, parse_mode:"Markdown" });
    const tag = parseTag(tr);
    if (tag) { await bot.deleteMessage(id, st.message_id); return doTag(id, tag); }
    const reply = await ai(id, tr);
    await bot.deleteMessage(id, st.message_id);
    sendLong(id, `🎤 *${tr}*\n\n${reply}`);
  } catch (e) { console.error(e); bot.editMessageText(t.voiceErr, { chat_id:id, message_id:st.message_id }); }
});

// ════════════════════════════════════════════════════════════════════════════
//  ФАЙЛЫ Excel / CSV
// ════════════════════════════════════════════════════════════════════════════

bot.on("document", async (msg) => {
  const id = msg.chat.id; const t = T(id);
  const doc = msg.document; const name = doc.file_name || "";
  if (![".xlsx",".xls",".csv"].some(e => name.endsWith(e))) return bot.sendMessage(id, t.fileNo, kb(id));
  const st = await bot.sendMessage(id, t.fileRead(name), { parse_mode:"Markdown" });
  bot.sendChatAction(id, "typing");
  try {
    const fp = await dlFile(doc.file_id);
    const wb = XLSX.readFile(fp); let data = "";
    wb.SheetNames.forEach(s => { data += `\n=== ${s} ===\n`; XLSX.utils.sheet_to_json(wb.Sheets[s],{header:1}).slice(0,100).forEach(r=>{ data+=r.join(" | ")+"\n"; }); });
    fs.unlink(fp, ()=>{});
    data = data.slice(0, 8000);
    await bot.editMessageText(t.fileAna, { chat_id:id, message_id:st.message_id });
    const u = getUser(id); const prev = u.mode; u.mode = "analyst"; saveUser(id, u);
    const reply = await ai(id, msg.caption || t.analyzeQ, `"${name}":\n\`\`\`\n${data}\n\`\`\``);
    u.mode = prev; saveUser(id, u);
    await bot.deleteMessage(id, st.message_id);
    sendLong(id, t.fileRes(name) + reply);
  } catch (e) { console.error(e); bot.editMessageText(t.fileErr, { chat_id:id, message_id:st.message_id }); }
});

// ════════════════════════════════════════════════════════════════════════════
//  CALLBACK QUERY
// ════════════════════════════════════════════════════════════════════════════

bot.on("callback_query", async (q) => {
  const id = q.message.chat.id;
  bot.answerCallbackQuery(q.id);
  const d = q.data;

  if (d === "lang_ru" || d === "lang_uz") {
    const lang = d === "lang_ru" ? "ru" : "uz";
    const u = getUser(id); u.lang = lang; saveUser(id, u);
    if (!u.ready) { waitingName.add(id); return bot.sendMessage(id, LANG[lang].askName, { reply_markup: { remove_keyboard: true } }); }
    return bot.sendMessage(id, LANG[lang].langOk, { parse_mode:"Markdown", ...kb(id) });
  }
  if (d === "crm_more") { waitingCRM.set(id, { step:"name" }); return bot.sendMessage(id, T(id)===LANG.uz?"👤 Kontakt ismini kiriting:":"👤 Введите имя контакта:", { reply_markup:{remove_keyboard:true} }); }
  if (d === "crm_done") return showDashboard(id);
  if (d.startsWith("grp_")) {
    const gid = d.replace("grp_",""); const g = getGroups()[gid]; const u = getUser(id);
    u.groupId = gid; saveUser(id, u);
    bot.sendMessage(id, T(id).grpLinked(g.title), { parse_mode:"Markdown", ...kb(id) });
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ГЛАВНЫЙ ОБРАБОТЧИК
// ════════════════════════════════════════════════════════════════════════════

bot.on("message", async (msg) => {
  const id = msg.chat.id; const text = msg.text;
  if (!text) return;
  const u = getUser(id);

  // 1. Нет языка
  if (!u.lang) return showLangPicker(id);

  const t = T(id);

  // 2. Ожидаем имя пользователя (онбординг)
  if (waitingName.has(id)) {
    waitingName.delete(id);
    u.name  = text.trim();
    u.ready = true;
    saveUser(id, u);
    // Сразу знакомимся и просим первый контакт
    await bot.sendMessage(id, t.metName(u.name), { parse_mode:"Markdown", reply_markup:{remove_keyboard:true} });
    // Автоматически начинаем CRM
    waitingCRM.set(id, { step:"name" });
    return;
  }

  // 3. Шаги CRM
  if (waitingCRM.has(id)) { if (await handleCRM(id, text)) return; }

  // 4. Кнопки режимов
  const modeKey = t.modeMap[text];
  if (modeKey) {
    u.mode = modeKey; u.history = []; saveUser(id, u);
    return bot.sendMessage(id, t.modeOk(getModes(u.lang)[modeKey].label), { parse_mode:"Markdown", ...kb(id) });
  }

  if (text === t.btn.contacts) return showContacts(id);
  if (text === t.btn.tasks)    return showTasks(id);
  if (text === t.btn.help)     return bot.sendMessage(id, t.help, { parse_mode:"Markdown", ...kb(id) });
  if (text === t.btn.reset)    { u.history=[]; saveUser(id,u); return bot.sendMessage(id, t.histOk, kb(id)); }
  if (text.startsWith("/"))    return;

  // 5. Google Sheets
  if (text.includes("docs.google.com/spreadsheets")) {
    const st = await bot.sendMessage(id, t.sheetLoad);
    bot.sendChatAction(id, "typing");
    try {
      const m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/); if (!m) throw new Error();
      const r = await axios.get(`https://docs.google.com/spreadsheets/d/${m[1]}/export?format=csv`, { responseType:"text", timeout:10000 });
      await bot.editMessageText(t.sheetAna, { chat_id:id, message_id:st.message_id });
      const prev = u.mode; u.mode="analyst"; saveUser(id,u);
      const reply = await ai(id, t.analyzeQ, `\`\`\`\n${r.data.slice(0,8000)}\n\`\`\``);
      u.mode=prev; saveUser(id,u);
      await bot.deleteMessage(id, st.message_id);
      sendLong(id, t.sheetRes + reply);
    } catch (_) { bot.editMessageText(t.sheetErr, { chat_id:id, message_id:st.message_id }); }
    return;
  }

  // 6. Тегинг
  const tag = parseTag(text);
  if (tag) return doTag(id, tag);

  // 7. Обычный вопрос
  bot.sendChatAction(id, "typing");
  try {
    const reply = await ai(id, text);
    sendLong(id, reply + (u.mode==="time" ? t.timeHint : ""));
  } catch (e) { console.error(e); bot.sendMessage(id, "❌ Ошибка. Попробуйте ещё раз.", kb(id)); }
});

console.log("✅ Бот запущен!");
