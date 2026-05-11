const TelegramBot = require("node-telegram-bot-api");
const Groq = require("groq-sdk");
const axios = require("axios");
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const DB_FILE = path.join(__dirname, "bot_data.json");

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const groq = new Groq({ apiKey: GROQ_API_KEY });

// ════════════════════════════════════════════════
//  ПЕРЕВОДЫ
// ════════════════════════════════════════════════

const LANG = {
  ru: {
    chooseLang:     "🌐 Выберите язык / Tilni tanlang:",
    askName:        "👋 Привет! Я ваш умный бизнес-ассистент.\n\nКак вас зовут? Введите ваше имя:",
    greetName:      (n) => `Приятно познакомиться, *${n}*! 👋\n\nДобавим первого клиента в базу?\nЭто займёт минуту.`,
    addClientBtn:   "➕ Добавить клиента",
    skipBtn:        "⏭ Пропустить",
    addMoreBtn:     "➕ Добавить ещё",
    doneBtn:        "✅ Готово — показать дашборд",
    dashTitle:      (n, d, t) => `👋 *${n}*, добрый день!\n📅 ${d}  🕐 ${t}\n━━━━━━━━━━━━━━━━━━━\n\n`,
    tasksHeader:    (c) => `📋 *Задачи (${c}):*\n`,
    tasksEmpty:     "_Список пуст_\n",
    tasksHint:      "_/add 14:30 Задача — добавить_\n\n",
    clientsHeader:  (c) => `👥 *Клиенты (${c}):*\n`,
    clientsEmpty:   "_Пусто — /newclient_\n",
    clientsMore:    (n) => `_...и ещё ${n} контактов_\n`,
    groupLinked:    (t) => `👥 *Группа:* ${t}\n\n`,
    chooseMode:     "Выберите режим работы:",
    modeChanged:    (l) => `Режим: *${l}* ✅`,
    histCleared:    "История очищена ✅",
    clientAdded:    (c) => `🎉 *Клиент добавлен!*\n\n👤 ${c.name}\n📱 ${c.username||"—"}\n📞 ${c.phone||"—"}\n📝 ${c.note||"—"}`,
    addMoreQ:       "Добавить ещё одного клиента?",
    clientsEmpty2:  "👥 *База клиентов пуста*\n\nДобавьте первого:\n/newclient",
    clientsList:    "👥 *База клиентов:*\n\n",
    clientsFooter:  "_/newclient — добавить | /delclient N — удалить_",
    clientDeleted:  (n) => `🗑 Клиент *${n}* удалён.`,
    clientNotFound: "❌ Клиент не найден.",
    newClientS1:    "👤 *Новый клиент*\n\nШаг 1/4: Введите имя клиента:",
    newClientS2:    (n) => `✅ Имя: *${n}*\n\nШаг 2/4: Telegram username (@username)\nЕсли нет — напишите "нет"`,
    newClientS3:    (u) => `✅ Username: ${u||"—"}\n\nШаг 3/4: Номер телефона\nЕсли нет — напишите "нет"`,
    newClientS4:    (p) => `✅ Телефон: ${p||"—"}\n\nШаг 4/4: Заметка о клиенте\n(должность, компания, что обсуждали)\nЕсли нет — напишите "нет"`,
    tasksEmpty3:    "📋 *Задач нет*\n\n/add 14:30 Встреча\n/add Написать отчёт",
    taskAdded:      (n, t, tm) => `✅ Задача #${n}: _${t}_${tm ? `\n⏰ Время: *${tm}* — напомню за 1 час!` : "\n💡 _/add ЧЧ:ММ Задача — с временем_"}`,
    taskDone:       (t) => `🎉 Выполнено: _${t}_`,
    taskDeleted:    (t) => `🗑 Удалено: _${t}_`,
    taskNotFound:   "❌ Задача не найдена.",
    remind:         (m, t) => `⏰ Напомню через *${m} мин*:\n_${t}_`,
    remindFired:    (t) => `⏰ *Напоминание!*\n\n${t}`,
    remind60:       (t, tm) => `⏰ *Напоминание за 1 час!*\n\nЧерез час:\n📌 *${t}*\nВремя: *${tm}*\n\n_Подготовьтесь заранее!_`,
    remindNow:      (t, tm) => `🔔 *Пора начинать!*\n\n📌 *${t}*\nВремя: *${tm}*`,
    remindBadTime:  "❌ Укажите от 1 до 1440 минут.",
    voiceRecog:     "🎤 Распознаю голос...",
    voiceSaid:      (t) => `🎤 *Вы сказали:* _${t}_\n\n⏳ Думаю...`,
    voiceReply:     (t, r) => `🎤 *Вы сказали:* _${t}_\n\n${r}`,
    voiceError:     "❌ Не удалось распознать голос.",
    fileReading:    (n) => `📁 Читаю *${n}*...`,
    fileAnalyzing:  "📊 Анализирую...",
    fileResult:     (n) => `📁 *Анализ: ${n}*\n\n`,
    fileError:      "❌ Ошибка чтения файла.",
    fileUnsupported:"📎 Поддерживаются: .xlsx, .xls, .csv",
    sheetsLoading:  "📊 Загружаю Google Таблицу...",
    sheetsAnalyzing:"🔍 Анализирую...",
    sheetsResult:   "📊 *Анализ Google Таблицы*\n\n",
    sheetsError:    "❌ Не удалось загрузить. Убедитесь что таблица открыта для просмотра.",
    noGroup:        "❌ Вы не привязали группу.\n\nДобавьте бота в группу, затем напишите /linkgroup",
    clientNoUser:   (n) => `❌ У контакта *${n}* нет Telegram username.\n\nОбновите контакт через /newclient`,
    tagNotFound:    (n) => `❓ Контакт *${n}* не найден.\n\n/newclient — добавить\n_Для тегинга нужен @username_`,
    tagSent:        (u, m) => `✅ Отправлено!\n\n📤 *${u}* — ${m}`,
    tagError:       "❌ Не удалось отправить. Бот должен быть участником группы.",
    groupLinkedMsg: (t) => `✅ Группа *${t}* привязана!\n\nПишите в личку:\n_"спроси у Шомахсуда сделал ли он инфографику"_`,
    noGroups:       "❌ Бот не добавлен ни в одну группу.\n\n*Как:*\n1. Откройте группу в Telegram\n2. Добавьте бота как участника\n3. Напишите /linkgroup",
    chooseGroup:    "Выберите группу:",
    langChanged:    "✅ Язык изменён на Русский",
    helpText: `*Все возможности:*\n\n*Режимы:*\n🤖 Бизнес · 💡 Идеи · ✏️ Тексты\n📈 Аналитик · ⚖️ Законы · 🧮 Бухгалтер · ⏰ Тайм\n\n*Задачи:*\n/add 14:30 Встреча — добавить (авто-напоминание за 1 час!)\n/done 1 · /del 2 · /remind 30 Текст\n📋 Мои задачи\n\n*База клиентов:*\n/newclient · /clients · /delclient N\n\n*Тегинг в группе:*\n1. Добавьте бота в группу\n2. /linkgroup — привяжите\n3. Пишите: _"спроси у Имя сделал ли он X"_\n\n*Файлы:* xlsx/csv · Google Sheets ссылка\n*Голос:* 🎤 запишите сообщение\n*Язык:* /lang`,
    analyzePrompt:  "Проанализируй таблицу: ключевые показатели, тренды, аномалии, рекомендации.",
    tagHint:        "\n\n💡 _/add ЧЧ:ММ Задача — добавить | /remind 30 Текст — напомнить_",
    kb: [
      ["🤖 Бизнес", "💡 Идеи", "✏️ Тексты"],
      ["📈 Аналитик", "⚖️ Законы", "🧮 Бухгалтер"],
      ["⏰ Тайм-менеджмент", "👥 База клиентов"],
      ["📋 Мои задачи", "🔄 Сбросить историю", "❓ Помощь"],
    ],
    modeMap: {
      "🤖 Бизнес": "general", "💡 Идеи": "brainstorm", "✏️ Тексты": "text",
      "📈 Аналитик": "analyst", "⚖️ Законы": "law", "🧮 Бухгалтер": "accountant",
      "⏰ Тайм-менеджмент": "time",
    },
    buttons: { clients: "👥 База клиентов", tasks: "📋 Мои задачи", help: "❓ Помощь", reset: "🔄 Сбросить историю" },
    no: ["нет", "yo'q", "no"],
  },

  uz: {
    chooseLang:     "🌐 Выберите язык / Tilni tanlang:",
    askName:        "👋 Salom! Men sizning aqlli biznes yordamchingizman.\n\nIsмingiz nima? Ismingizni kiriting:",
    greetName:      (n) => `Tanishganimdan xursandman, *${n}*! 👋\n\nMijozlar bazasiga birinchi mijozni qo'shamizmi?\nBu bir daqiqa vaqt oladi.`,
    addClientBtn:   "➕ Mijoz qo'shish",
    skipBtn:        "⏭ O'tkazib yuborish",
    addMoreBtn:     "➕ Yana qo'shish",
    doneBtn:        "✅ Tayyor — dashboardni ko'rsatish",
    dashTitle:      (n, d, t) => `👋 *${n}*, xayrli kun!\n📅 ${d}  🕐 ${t}\n━━━━━━━━━━━━━━━━━━━\n\n`,
    tasksHeader:    (c) => `📋 *Vazifalar (${c}):*\n`,
    tasksEmpty:     "_Ro'yxat bo'sh_\n",
    tasksHint:      "_/add 14:30 Vazifa — qo'shish_\n\n",
    clientsHeader:  (c) => `👥 *Mijozlar (${c}):*\n`,
    clientsEmpty:   "_Bo'sh — /newclient_\n",
    clientsMore:    (n) => `_...va yana ${n} ta kontakt_\n`,
    groupLinked:    (t) => `👥 *Guruh:* ${t}\n\n`,
    chooseMode:     "Ish rejimini tanlang:",
    modeChanged:    (l) => `Rejim: *${l}* ✅`,
    histCleared:    "Tarix tozalandi ✅",
    clientAdded:    (c) => `🎉 *Mijoz qo'shildi!*\n\n👤 ${c.name}\n📱 ${c.username||"—"}\n📞 ${c.phone||"—"}\n📝 ${c.note||"—"}`,
    addMoreQ:       "Yana bir mijoz qo'shilsinmi?",
    clientsEmpty2:  "👥 *Mijozlar bazasi bo'sh*\n\nBirinchisini qo'shing:\n/newclient",
    clientsList:    "👥 *Mijozlar bazasi:*\n\n",
    clientsFooter:  "_/newclient — qo'shish | /delclient N — o'chirish_",
    clientDeleted:  (n) => `🗑 Mijoz *${n}* o'chirildi.`,
    clientNotFound: "❌ Mijoz topilmadi.",
    newClientS1:    "👤 *Yangi mijoz*\n\n1/4-qadam: Mijoz ismini kiriting:",
    newClientS2:    (n) => `✅ Ism: *${n}*\n\n2/4-qadam: Telegram username (@username)\nYo'q bo'lsa — "yo'q" deb yozing`,
    newClientS3:    (u) => `✅ Username: ${u||"—"}\n\n3/4-qadam: Telefon raqami\nYo'q bo'lsa — "yo'q" deb yozing`,
    newClientS4:    (p) => `✅ Telefon: ${p||"—"}\n\n4/4-qadam: Mijoz haqida eslatma\n(lavozim, kompaniya, nima muhokama qilindi)\nYo'q bo'lsa — "yo'q" deb yozing`,
    tasksEmpty3:    "📋 *Vazifalar yo'q*\n\n/add 14:30 Uchrashuv\n/add Hisobot yozish",
    taskAdded:      (n, t, tm) => `✅ Vazifa #${n}: _${t}_${tm ? `\n⏰ Vaqt: *${tm}* — 1 soat oldin eslataman!` : "\n💡 _/add SS:DD Vazifa — vaqt bilan_"}`,
    taskDone:       (t) => `🎉 Bajarildi: _${t}_`,
    taskDeleted:    (t) => `🗑 O'chirildi: _${t}_`,
    taskNotFound:   "❌ Vazifa topilmadi.",
    remind:         (m, t) => `⏰ *${m} daqiqadan* keyin eslataman:\n_${t}_`,
    remindFired:    (t) => `⏰ *Eslatma!*\n\n${t}`,
    remind60:       (t, tm) => `⏰ *1 soat qoldi!*\n\nBir soatdan keyin:\n📌 *${t}*\nVaqt: *${tm}*\n\n_Oldindan tayyorlaning!_`,
    remindNow:      (t, tm) => `🔔 *Boshlash vaqti keldi!*\n\n📌 *${t}*\nVaqt: *${tm}*`,
    remindBadTime:  "❌ 1 dan 1440 gacha daqiqa kiriting.",
    voiceRecog:     "🎤 Ovozni taniyapman...",
    voiceSaid:      (t) => `🎤 *Siz aytdingiz:* _${t}_\n\n⏳ O'ylamoqdaman...`,
    voiceReply:     (t, r) => `🎤 *Siz aytdingiz:* _${t}_\n\n${r}`,
    voiceError:     "❌ Ovozni tanib bo'lmadi.",
    fileReading:    (n) => `📁 *${n}* o'qimoqdaman...`,
    fileAnalyzing:  "📊 Tahlil qilmoqdaman...",
    fileResult:     (n) => `📁 *Tahlil: ${n}*\n\n`,
    fileError:      "❌ Faylni o'qishda xato.",
    fileUnsupported:"📎 Qo'llab-quvvatlanadi: .xlsx, .xls, .csv",
    sheetsLoading:  "📊 Google Jadvalini yuklamoqdaman...",
    sheetsAnalyzing:"🔍 Tahlil qilmoqdaman...",
    sheetsResult:   "📊 *Google Jadvali tahlili*\n\n",
    sheetsError:    "❌ Yuklab bo'lmadi. Jadval ochiq bo'lishiga ishonch hosil qiling.",
    noGroup:        "❌ Guruh ulanmagan.\n\nBotni guruhga qo'shing, keyin /linkgroup yozing",
    clientNoUser:   (n) => `❌ *${n}* kontaktining Telegram usernamesi yo'q.\n\n/newclient orqali yangilang`,
    tagNotFound:    (n) => `❓ *${n}* kontakti topilmadi.\n\n/newclient — qo'shish\n_Teglash uchun @username kerak_`,
    tagSent:        (u, m) => `✅ Yuborildi!\n\n📤 *${u}* — ${m}`,
    tagError:       "❌ Guruhga yubora olmadi. Bot guruh a'zosi bo'lishi kerak.",
    groupLinkedMsg: (t) => `✅ *${t}* guruhi ulandi!\n\nShaxsiy chatda yozing:\n_"Shomaxsuddan infografika tayyor bo'ldimi deb so'ra"_`,
    noGroups:       "❌ Bot hech bir guruhga qo'shilmagan.\n\n*Qanday:*\n1. Telegramda guruhingizni oching\n2. Botni a'zo sifatida qo'shing\n3. /linkgroup yozing",
    chooseGroup:    "Guruhni tanlang:",
    langChanged:    "✅ Til O'zbek tiliga o'zgartirildi",
    helpText: `*Barcha imkoniyatlar:*\n\n*Rejimlar:*\n🤖 Biznes · 💡 G'oyalar · ✏️ Matnlar\n📈 Tahlilchi · ⚖️ Qonunlar · 🧮 Hisobchi · ⏰ Vaqt\n\n*Vazifalar:*\n/add 14:30 Uchrashuv — qo'shish (1 soat oldin eslatadi!)\n/done 1 · /del 2 · /remind 30 Matn\n📋 Mening vazifalarim\n\n*Mijozlar bazasi:*\n/newclient · /clients · /delclient N\n\n*Guruhda teglash:*\n1. Botni guruhga qo'shing\n2. /linkgroup — ulash\n3. Yozing: _"Shomaxsuddan X qildimi deb so'ra"_\n\n*Fayllar:* xlsx/csv · Google Sheets havola\n*Ovoz:* 🎤 ovozli xabar yuboring\n*Til:* /lang`,
    analyzePrompt:  "Jadvalni tahlil qil: asosiy ko'rsatkichlar, trendlar, anomaliyalar, tavsiyalar.",
    tagHint:        "\n\n💡 _/add SS:DD Vazifa — qo'shish | /remind 30 Matn — eslatma_",
    kb: [
      ["🤖 Biznes", "💡 G'oyalar", "✏️ Matnlar"],
      ["📈 Tahlilchi", "⚖️ Qonunlar", "🧮 Hisobchi"],
      ["⏰ Vaqt menejment", "👥 Mijozlar bazasi"],
      ["📋 Mening vazifalarim", "🔄 Tarixni tozalash", "❓ Yordam"],
    ],
    modeMap: {
      "🤖 Biznes": "general", "💡 G'oyalar": "brainstorm", "✏️ Matnlar": "text",
      "📈 Tahlilchi": "analyst", "⚖️ Qonunlar": "law", "🧮 Hisobchi": "accountant",
      "⏰ Vaqt menejment": "time",
    },
    buttons: { clients: "👥 Mijozlar bazasi", tasks: "📋 Mening vazifalarim", help: "❓ Yordam", reset: "🔄 Tarixni tozalash" },
    no: ["нет", "yo'q", "no", "yoq"],
  },
};

// Вернуть переводы для пользователя
function T(chatId) {
  const user = getUser(chatId);
  return LANG[user.lang || "ru"];
}

function mainKb(chatId) {
  return { reply_markup: { keyboard: T(chatId).kb, resize_keyboard: true } };
}

// ════════════════════════════════════════════════
//  РЕЖИМЫ (AI system prompts — двуязычные)
// ════════════════════════════════════════════════

function getModes(lang) {
  const isUz = lang === "uz";
  const l = isUz ? "o'zbek tilida" : "на русском языке";
  return {
    general:    { label: isUz ? "🤖 Biznes"      : "🤖 Бизнес",      system: `Siz tajribali biznes yordamchisisiz. Qisqa va aniq javob bering, ${l}.` },
    brainstorm: { label: isUz ? "💡 G'oyalar"    : "💡 Идеи",        system: `Siz ijodiy biznes strategsiz. Raqamlangan konkret g'oyalar taklif qiling, ${l}.` },
    text:       { label: isUz ? "✏️ Matnlar"     : "✏️ Тексты",      system: `Siz professional biznes kopirayteriсiz. Xatlar, shartномalar, postlar yozing, ${l}.` },
    analyst:    { label: isUz ? "📈 Tahlilchi"   : "📈 Аналитик",    system: `Siz moliyaviy tahlilchisiz. KPI, ROI, EBITDA, marjani hisoblang, prognoz bering, ${l}.` },
    law:        { label: isUz ? "⚖️ Qonunlar"    : "⚖️ Законы",      system: `Siz O'zbekiston Respublikasi qonunchiligi bo'yicha yuridik maslahatchi siz. Konstitutsiya, Soliq kodeksi (QQS 12%, foyda solig'i 15%, JSHDS 12%, ijtimoiy soliq 12%, INPS 0.1%, aylanma solig'i 4%), Mehnat kodeksi, Fuqarolik kodeksi, MChJ qonuni. Moddaga havola bering. Javoblaringizda ${l}.` },
    accountant: { label: isUz ? "🧮 Hisobchi"    : "🧮 Бухгалтер",   system: `Siz O'zbekiston professional buxgalteri siz. Stavkalar: QQS 12%, foyda solig'i 15%, JSHDS 12%, ijtimoiy soliq 12%, INPS 0.1%, aylanma solig'i 4%. Ish haqi hisoblash: INPS=X×0.001, JSHDS=(X−INPS)×0.12, Qo'lga=(X−INPS−JSHDS), Ijt.soliq=X×0.12. Formulalar bilan ko'rsating. Javob ${l}.` },
    time:       { label: isUz ? "⏰ Vaqt menejment" : "⏰ Тайм-менеджмент", system: `Siz vaqt menejment ekspertisiz. Eyzenhauer matritsasi (🔴Shoshilinch+Muhim/🟡Muhim/🟠Shoshilinch/⚪Keraksiz), Time Blocking, Pomodoro (25+5 min), 2 daqiqa qoidasi, Pareto 80/20 qo'llang. Kun rejasini soat bo'yicha tuzing. Javob ${l}.` },
  };
}

// ════════════════════════════════════════════════
//  БАЗА ДАННЫХ
// ════════════════════════════════════════════════

function loadDB() {
  try { if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch (_) {}
  return { users: {}, groups: {} };
}
function saveDB(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }

function getUser(chatId) {
  const db = loadDB();
  if (!db.users[chatId]) {
    db.users[chatId] = { name: null, lang: null, mode: "general", history: [], tasks: [], clients: [], linkedGroupId: null, onboarded: false };
    saveDB(db);
  }
  return db.users[chatId];
}
function saveUser(chatId, u) { const db = loadDB(); db.users[chatId] = u; saveDB(db); }
function saveGroup(gid, data) { const db = loadDB(); db.groups[gid] = data; saveDB(db); }
function getGroups() { return loadDB().groups || {}; }

// ════════════════════════════════════════════════
//  ВСПОМОГАТЕЛЬНЫЕ
// ════════════════════════════════════════════════

async function sendLong(chatId, text, opts = {}) {
  const MAX = 4000;
  const options = { parse_mode: "Markdown", ...mainKb(chatId), ...opts };
  if (text.length <= MAX) return bot.sendMessage(chatId, text, options);
  for (let i = 0; i < text.length; i += MAX)
    await bot.sendMessage(chatId, text.slice(i, i + MAX), options);
}

async function askGroq(chatId, userMessage, extraContext = "") {
  const user = getUser(chatId);
  const modes = getModes(user.lang || "ru");
  const systemPrompt = modes[user.mode || "general"].system;
  const content = extraContext ? `${extraContext}\n\n${userMessage}` : userMessage;
  const history = user.history || [];
  history.push({ role: "user", content });
  if (history.length > 20) history.splice(0, history.length - 20);
  const resp = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile", max_tokens: 1500,
    messages: [{ role: "system", content: systemPrompt }, ...history],
  });
  const reply = resp.choices[0].message.content;
  history.push({ role: "assistant", content: reply });
  user.history = history;
  saveUser(chatId, user);
  return reply;
}

function parseTimeStr(str) {
  const m = str.match(/(\d{1,2})[:\.](\d{2})/);
  if (!m) return null;
  const h = parseInt(m[1]), min = parseInt(m[2]);
  if (h > 23 || min > 59) return null;
  return { h, m: min };
}

// ════════════════════════════════════════════════
//  ОНБОРДИНГ + /start
// ════════════════════════════════════════════════

const pendingOnboarding = new Set();
const pendingClientAdd  = new Map();

function sendLangPicker(chatId) {
  bot.sendMessage(chatId, LANG.ru.chooseLang, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🇷🇺 Русский", callback_data: "lang_ru" }],
        [{ text: "🇺🇿 O'zbek tili", callback_data: "lang_uz" }],
      ],
    },
  });
}

function sendDashboard(chatId) {
  const t = T(chatId);
  const user = getUser(chatId);
  const now = new Date();
  const d = `${String(now.getDate()).padStart(2,"0")}.${String(now.getMonth()+1).padStart(2,"0")}.${now.getFullYear()}`;
  const time = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;

  const tasks = (user.tasks || []).filter(x => !x.done)
    .sort((a,b) => { if (a.time && b.time) return a.time.localeCompare(b.time); if (a.time) return -1; if (b.time) return 1; return 0; });
  const clients = user.clients || [];

  let text = t.dashTitle(user.name, d, time);

  text += t.tasksHeader(tasks.length);
  if (tasks.length === 0) { text += t.tasksEmpty; }
  else { tasks.forEach((tk, i) => { const ts = tk.time ? `🕐 ${tk.time} ` : "     "; text += `${i+1}. ${ts}${tk.text}\n`; }); }
  text += t.tasksHint;

  text += t.clientsHeader(clients.length);
  if (clients.length === 0) { text += t.clientsEmpty; }
  else {
    clients.slice(0, 5).forEach(c => { text += `• ${c.name}${c.username ? ` ${c.username}` : ""}${c.phone ? ` · ${c.phone}` : ""}\n`; });
    if (clients.length > 5) text += t.clientsMore(clients.length - 5);
  }
  text += "\n";

  if (user.linkedGroupId) {
    const g = getGroups()[user.linkedGroupId];
    if (g) text += t.groupLinked(g.title);
  }

  text += t.chooseMode;
  bot.sendMessage(chatId, text, { parse_mode: "Markdown", ...mainKb(chatId) });
}

bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const user = getUser(chatId);
  if (!user.lang) return sendLangPicker(chatId);
  if (!user.onboarded) {
    pendingOnboarding.add(chatId);
    return bot.sendMessage(chatId, T(chatId).askName, { reply_markup: { remove_keyboard: true } });
  }
  sendDashboard(chatId);
});

// /lang — сменить язык
bot.onText(/\/lang/, (msg) => sendLangPicker(msg.chat.id));

// ════════════════════════════════════════════════
//  БАЗА КЛИЕНТОВ
// ════════════════════════════════════════════════

function showClients(chatId) {
  const t = T(chatId);
  const user = getUser(chatId);
  const clients = user.clients || [];
  if (clients.length === 0)
    return bot.sendMessage(chatId, t.clientsEmpty2, { parse_mode: "Markdown", ...mainKb(chatId) });
  let text = t.clientsList;
  clients.forEach((c, i) => {
    text += `*${i+1}. ${c.name}*\n`;
    if (c.username) text += `   📱 ${c.username}\n`;
    if (c.phone)    text += `   📞 ${c.phone}\n`;
    if (c.note)     text += `   📝 ${c.note}\n`;
    text += "\n";
  });
  text += t.clientsFooter;
  sendLong(chatId, text);
}

function startAddClient(chatId) {
  pendingClientAdd.set(chatId, { step: "name" });
  bot.sendMessage(chatId, T(chatId).newClientS1, { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } });
}

async function handleClientSteps(chatId, text) {
  const step = pendingClientAdd.get(chatId);
  const t = T(chatId);
  if (!step) return false;
  const noWords = t.no;
  const isNo = (s) => noWords.some(w => s.toLowerCase().trim() === w);

  if (step.step === "name") {
    step.name = text; step.step = "username";
    bot.sendMessage(chatId, t.newClientS2(text), { parse_mode: "Markdown" });
    return true;
  }
  if (step.step === "username") {
    step.username = isNo(text) ? null : text.startsWith("@") ? text : `@${text}`;
    step.step = "phone";
    bot.sendMessage(chatId, t.newClientS3(step.username), { parse_mode: "Markdown" });
    return true;
  }
  if (step.step === "phone") {
    step.phone = isNo(text) ? null : text;
    step.step = "note";
    bot.sendMessage(chatId, t.newClientS4(step.phone), { parse_mode: "Markdown" });
    return true;
  }
  if (step.step === "note") {
    step.note = isNo(text) ? null : text;
    pendingClientAdd.delete(chatId);
    const user = getUser(chatId);
    if (!user.clients) user.clients = [];
    user.clients.push({ id: Date.now(), name: step.name, username: step.username, phone: step.phone, note: step.note, addedAt: new Date().toISOString() });
    saveUser(chatId, user);
    bot.sendMessage(chatId, t.clientAdded(step), { parse_mode: "Markdown" });
    bot.sendMessage(chatId, t.addMoreQ, {
      reply_markup: { inline_keyboard: [
        [{ text: t.addMoreBtn, callback_data: "start_add_client" }],
        [{ text: t.doneBtn,    callback_data: "skip_client" }],
      ]},
    });
    return true;
  }
  return false;
}

bot.onText(/\/newclient/, (msg) => startAddClient(msg.chat.id));
bot.onText(/\/clients/,   (msg) => showClients(msg.chat.id));

bot.onText(/\/delclient (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const t = T(chatId);
  const user = getUser(chatId);
  const idx = parseInt(match[1]) - 1;
  if (!user.clients || idx < 0 || idx >= user.clients.length)
    return bot.sendMessage(chatId, t.clientNotFound, mainKb(chatId));
  const removed = user.clients.splice(idx, 1)[0];
  saveUser(chatId, user);
  bot.sendMessage(chatId, t.clientDeleted(removed.name), { parse_mode: "Markdown", ...mainKb(chatId) });
});

// ════════════════════════════════════════════════
//  ЗАДАЧИ
// ════════════════════════════════════════════════

bot.onText(/\/add (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const t = T(chatId);
  const user = getUser(chatId);
  if (!user.tasks) user.tasks = [];
  const raw = match[1].trim();
  const timeMatch = raw.match(/^(\d{1,2}[:\.]?\d{2})\s+(.*)/);
  let taskText, taskTime;
  if (timeMatch) {
    const p = parseTimeStr(timeMatch[1]);
    if (p) { taskTime = `${String(p.h).padStart(2,"0")}:${String(p.m).padStart(2,"0")}`; taskText = timeMatch[2]; }
    else taskText = raw;
  } else taskText = raw;
  user.tasks.push({ id: Date.now(), text: taskText, time: taskTime||null, done: false, reminded60: false, reminderSet: false });
  saveUser(chatId, user);
  bot.sendMessage(chatId, t.taskAdded(user.tasks.length, taskText, taskTime), { parse_mode: "Markdown", ...mainKb(chatId) });
});

bot.onText(/\/done (\d+)/, (msg, match) => {
  const chatId = msg.chat.id; const t = T(chatId);
  const user = getUser(chatId); const idx = parseInt(match[1]) - 1;
  if (!user.tasks || idx < 0 || idx >= user.tasks.length) return bot.sendMessage(chatId, t.taskNotFound, mainKb(chatId));
  user.tasks[idx].done = true; saveUser(chatId, user);
  bot.sendMessage(chatId, t.taskDone(user.tasks[idx].text), { parse_mode: "Markdown", ...mainKb(chatId) });
});

bot.onText(/\/del (\d+)/, (msg, match) => {
  const chatId = msg.chat.id; const t = T(chatId);
  const user = getUser(chatId); const idx = parseInt(match[1]) - 1;
  if (!user.tasks || idx < 0 || idx >= user.tasks.length) return bot.sendMessage(chatId, t.taskNotFound, mainKb(chatId));
  const removed = user.tasks.splice(idx, 1)[0]; saveUser(chatId, user);
  bot.sendMessage(chatId, t.taskDeleted(removed.text), { parse_mode: "Markdown", ...mainKb(chatId) });
});

bot.onText(/\/remind (\d+) (.+)/, (msg, match) => {
  const chatId = msg.chat.id; const t = T(chatId);
  const minutes = parseInt(match[1]); const text = match[2].trim();
  if (minutes < 1 || minutes > 1440) return bot.sendMessage(chatId, t.remindBadTime, mainKb(chatId));
  setTimeout(() => bot.sendMessage(chatId, t.remindFired(text), { parse_mode: "Markdown", ...mainKb(chatId) }), minutes * 60000);
  bot.sendMessage(chatId, t.remind(minutes, text), { parse_mode: "Markdown", ...mainKb(chatId) });
});

function showTasks(chatId) {
  const t = T(chatId);
  const user = getUser(chatId);
  const tasks = user.tasks || [];
  if (tasks.length === 0) return bot.sendMessage(chatId, t.tasksEmpty3, { parse_mode: "Markdown", ...mainKb(chatId) });
  const pending = tasks.filter(x => !x.done);
  const done    = tasks.filter(x => x.done);
  let text = "";
  if (pending.length) {
    text += `📋 *${pending.length}:*\n`;
    tasks.forEach((tk, i) => { if (!tk.done) text += `${i+1}. ${tk.time ? `🕐 ${tk.time} ` : ""}${tk.text}\n`; });
  }
  if (done.length) {
    text += `\n✅ *${done.length}:*\n`;
    tasks.forEach((tk, i) => { if (tk.done) text += `${i+1}. ~${tk.text}~\n`; });
  }
  text += `\n_/done N · /del N · /add HH:MM Задача_`;
  sendLong(chatId, text);
}

// Авто-напоминания: каждую минуту
setInterval(() => {
  const db = loadDB();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  let changed = false;
  Object.entries(db.users).forEach(([chatId, user]) => {
    if (!user.tasks) return;
    const t = LANG[user.lang || "ru"];
    user.tasks.forEach(task => {
      if (task.done || !task.time) return;
      const p = parseTimeStr(task.time);
      if (!p) return;
      const diff = (p.h * 60 + p.m) - nowMin;
      if (diff === 60 && !task.reminded60) {
        bot.sendMessage(chatId, t.remind60(task.text, task.time), { parse_mode: "Markdown" });
        task.reminded60 = true; changed = true;
      }
      if (diff === 0 && !task.reminderSet) {
        bot.sendMessage(chatId, t.remindNow(task.text, task.time), { parse_mode: "Markdown" });
        task.reminderSet = true; changed = true;
      }
    });
    if (changed) db.users[chatId] = user;
  });
  if (changed) try { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); } catch(_) {}
}, 60000);

// ════════════════════════════════════════════════
//  ГРУППЫ + ТЕГИНГ
// ════════════════════════════════════════════════

bot.on("my_chat_member", (update) => {
  const chat = update.chat;
  if ((chat.type === "group" || chat.type === "supergroup") &&
      ["member","administrator"].includes(update.new_chat_member?.status))
    saveGroup(String(chat.id), { title: chat.title, id: chat.id });
});

bot.onText(/\/linkgroup/, (msg) => {
  const chatId = msg.chat.id;
  const t = T(chatId);
  const groups = Object.values(getGroups());
  if (groups.length === 0) return bot.sendMessage(chatId, t.noGroups, { parse_mode: "Markdown", ...mainKb(chatId) });
  bot.sendMessage(chatId, t.chooseGroup, {
    reply_markup: { inline_keyboard: groups.map(g => [{ text: g.title, callback_data: `link_${g.id}` }]) },
  });
});

function findClient(clients, name) {
  if (!clients) return null;
  const lo = name.toLowerCase();
  return clients.find(c => c.name.toLowerCase().includes(lo) || lo.includes(c.name.toLowerCase().split(" ")[0]));
}

function parseTagRequest(text) {
  const patterns = [
    /(?:спроси\s+у|спроси|ask)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:напомни|remind)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:тегни|отметь|tag|ping)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:so'ra|so'ragin)\s+([a-zA-Zа-яёА-ЯЁ]+)\s+(?:dan|dan\s+)?(.+)/i,
  ];
  for (const p of patterns) { const m = text.match(p); if (m) return { name: m[1], message: m[2] }; }
  return null;
}

async function handleTagRequest(chatId, tagReq) {
  const t = T(chatId);
  const user = getUser(chatId);
  if (!user.linkedGroupId) return bot.sendMessage(chatId, t.noGroup, { parse_mode: "Markdown", ...mainKb(chatId) });
  const client = findClient(user.clients, tagReq.name);
  if (!client) return bot.sendMessage(chatId, t.tagNotFound(tagReq.name), { parse_mode: "Markdown", ...mainKb(chatId) });
  if (!client.username) return bot.sendMessage(chatId, t.clientNoUser(client.name), { parse_mode: "Markdown", ...mainKb(chatId) });
  try {
    await bot.sendMessage(user.linkedGroupId, `${client.username}, ${tagReq.message}`);
    bot.sendMessage(chatId, t.tagSent(client.username, tagReq.message), { parse_mode: "Markdown", ...mainKb(chatId) });
  } catch (err) {
    bot.sendMessage(chatId, t.tagError, mainKb(chatId));
  }
}

// ════════════════════════════════════════════════
//  ГОЛОС
// ════════════════════════════════════════════════

async function downloadFile(fileId) {
  const fileInfo = await bot.getFile(fileId);
  const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${fileInfo.file_path}`;
  const ext = path.extname(fileInfo.file_path) || ".bin";
  const tmpPath = path.join("/tmp", `file_${fileId}${ext}`);
  const resp = await axios({ url: fileUrl, responseType: "arraybuffer" });
  fs.writeFileSync(tmpPath, resp.data);
  return tmpPath;
}

bot.on("voice", async (msg) => {
  const chatId = msg.chat.id;
  const t = T(chatId);
  const user = getUser(chatId);
  if (!user.lang) return sendLangPicker(chatId);

  const statusMsg = await bot.sendMessage(chatId, t.voiceRecog);
  bot.sendChatAction(chatId, "typing");
  try {
    const filePath = await downloadFile(msg.voice.file_id);
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(filePath), model: "whisper-large-v3-turbo",
      language: user.lang === "uz" ? "uz" : "ru", response_format: "text",
    });
    fs.unlink(filePath, () => {});
    const recognized = transcription;
    await bot.editMessageText(t.voiceSaid(recognized), { chat_id: chatId, message_id: statusMsg.message_id, parse_mode: "Markdown" });
    const tagReq = parseTagRequest(recognized);
    if (tagReq) { await bot.deleteMessage(chatId, statusMsg.message_id); return handleTagRequest(chatId, tagReq); }
    const reply = await askGroq(chatId, recognized);
    await bot.deleteMessage(chatId, statusMsg.message_id);
    sendLong(chatId, t.voiceReply(recognized, reply));
  } catch (err) {
    console.error("Voice:", err);
    bot.editMessageText(t.voiceError, { chat_id: chatId, message_id: statusMsg.message_id });
  }
});

// ════════════════════════════════════════════════
//  ФАЙЛЫ
// ════════════════════════════════════════════════

function parseSpreadsheet(filePath) {
  const wb = XLSX.readFile(filePath);
  let result = "";
  wb.SheetNames.forEach(n => {
    const data = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1 });
    result += `\n=== ${n} ===\n`;
    data.slice(0, 100).forEach(row => { result += row.join(" | ") + "\n"; });
  });
  fs.unlink(filePath, () => {});
  return result.slice(0, 8000);
}

bot.on("document", async (msg) => {
  const chatId = msg.chat.id;
  const t = T(chatId);
  const user = getUser(chatId);
  if (!user.lang) return sendLangPicker(chatId);
  const doc = msg.document;
  const name = doc.file_name || "";
  if (![".xlsx",".xls",".csv"].some(e => name.endsWith(e)))
    return bot.sendMessage(chatId, t.fileUnsupported, mainKb(chatId));
  const statusMsg = await bot.sendMessage(chatId, t.fileReading(name), { parse_mode: "Markdown" });
  bot.sendChatAction(chatId, "typing");
  try {
    const filePath = await downloadFile(doc.file_id);
    const tableData = parseSpreadsheet(filePath);
    await bot.editMessageText(t.fileAnalyzing, { chat_id: chatId, message_id: statusMsg.message_id });
    const prev = user.mode; user.mode = "analyst"; saveUser(chatId, user);
    const reply = await askGroq(chatId, msg.caption || t.analyzePrompt, `"${name}":\n\`\`\`\n${tableData}\n\`\`\``);
    user.mode = prev; saveUser(chatId, user);
    await bot.deleteMessage(chatId, statusMsg.message_id);
    sendLong(chatId, t.fileResult(name) + reply);
  } catch (err) {
    console.error("File:", err);
    bot.editMessageText(t.fileError, { chat_id: chatId, message_id: statusMsg.message_id });
  }
});

// ════════════════════════════════════════════════
//  CALLBACK QUERY (inline кнопки)
// ════════════════════════════════════════════════

bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  bot.answerCallbackQuery(query.id);

  if (query.data === "lang_ru" || query.data === "lang_uz") {
    const lang = query.data === "lang_ru" ? "ru" : "uz";
    const user = getUser(chatId);
    const wasOnboarded = user.onboarded;
    user.lang = lang;
    saveUser(chatId, user);

    if (!wasOnboarded) {
      pendingOnboarding.add(chatId);
      bot.sendMessage(chatId, LANG[lang].askName, { reply_markup: { remove_keyboard: true } });
    } else {
      bot.sendMessage(chatId, LANG[lang].langChanged, { parse_mode: "Markdown", ...mainKb(chatId) });
    }
    return;
  }

  if (query.data === "start_add_client") { startAddClient(chatId); return; }
  if (query.data === "skip_client")      { sendDashboard(chatId); return; }

  if (query.data.startsWith("link_")) {
    const groupId = query.data.replace("link_", "");
    const groups = getGroups();
    const group = groups[groupId];
    const user = getUser(chatId);
    user.linkedGroupId = groupId;
    saveUser(chatId, user);
    bot.sendMessage(chatId, T(chatId).groupLinkedMsg(group.title), { parse_mode: "Markdown", ...mainKb(chatId) });
  }
});

// ════════════════════════════════════════════════
//  ГЛАВНЫЙ ОБРАБОТЧИК ТЕКСТА
// ════════════════════════════════════════════════

bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  const user = getUser(chatId);

  // Нет языка — показать выбор
  if (!user.lang) return sendLangPicker(chatId);

  const t = T(chatId);

  // Онбординг: ввод имени
  if (pendingOnboarding.has(chatId)) {
    pendingOnboarding.delete(chatId);
    user.name = text.trim();
    user.onboarded = true;
    saveUser(chatId, user);
    bot.sendMessage(chatId, t.greetName(user.name), {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [
        [{ text: t.addClientBtn, callback_data: "start_add_client" }],
        [{ text: t.skipBtn,      callback_data: "skip_client" }],
      ]},
    });
    return;
  }

  // Шаги добавления клиента
  if (pendingClientAdd.has(chatId)) {
    const handled = await handleClientSteps(chatId, text);
    if (handled) return;
  }

  // Режимы
  const modeKey = t.modeMap[text];
  if (modeKey) {
    const modes = getModes(user.lang);
    user.mode = modeKey; user.history = [];
    saveUser(chatId, user);
    return bot.sendMessage(chatId, t.modeChanged(modes[modeKey].label), { parse_mode: "Markdown", ...mainKb(chatId) });
  }

  if (text === t.buttons.clients) return showClients(chatId);
  if (text === t.buttons.tasks)   return showTasks(chatId);
  if (text === t.buttons.help)    return bot.sendMessage(chatId, t.helpText, { parse_mode: "Markdown", ...mainKb(chatId) });
  if (text === t.buttons.reset) {
    user.history = []; saveUser(chatId, user);
    return bot.sendMessage(chatId, t.histCleared, mainKb(chatId));
  }

  if (text.startsWith("/")) return;

  // Google Sheets
  if (text.includes("docs.google.com/spreadsheets")) {
    const statusMsg = await bot.sendMessage(chatId, t.sheetsLoading);
    bot.sendChatAction(chatId, "typing");
    try {
      const match = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) throw new Error("no id");
      const resp = await axios.get(`https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`, { responseType: "text", timeout: 10000 });
      await bot.editMessageText(t.sheetsAnalyzing, { chat_id: chatId, message_id: statusMsg.message_id });
      const prev = user.mode; user.mode = "analyst"; saveUser(chatId, user);
      const reply = await askGroq(chatId, t.analyzePrompt, `\`\`\`\n${resp.data.slice(0, 8000)}\n\`\`\``);
      user.mode = prev; saveUser(chatId, user);
      await bot.deleteMessage(chatId, statusMsg.message_id);
      sendLong(chatId, t.sheetsResult + reply);
    } catch (err) {
      bot.editMessageText(t.sheetsError, { chat_id: chatId, message_id: statusMsg.message_id });
    }
    return;
  }

  // Тегинг
  const tagReq = parseTagRequest(text);
  if (tagReq) return handleTagRequest(chatId, tagReq);

  // "добавь клиента" / "mijoz qo'shish"
  if (/добавь клиента|mijoz qo['']shish/i.test(text)) return startAddClient(chatId);

  // Обычный вопрос
  bot.sendChatAction(chatId, "typing");
  try {
    const reply = await askGroq(chatId, text);
    const hint = user.mode === "time" ? t.tagHint : "";
    sendLong(chatId, reply + hint);
  } catch (err) {
    console.error("Groq:", err);
    bot.sendMessage(chatId, "❌ Error. Try again.", mainKb(chatId));
  }
});

console.log("🤖 Bot started | RU + UZ | CRM | Reminders | Group tagging 🎤");
