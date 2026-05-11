const TelegramBot = require("node-telegram-bot-api");
const Groq        = require("groq-sdk");
const axios       = require("axios");
const FormData    = require("form-data");
const XLSX        = require("xlsx");
const express     = require("express");
const fs          = require("fs");
const path        = require("path");

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const GROQ_API_KEY   = process.env.GROQ_API_KEY;
const PORT           = process.env.PORT || 3000;
const DB_FILE        = path.join("/tmp", "db.json");

const bot  = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const groq = new Groq({ apiKey: GROQ_API_KEY });

// Render health-check
const app = express();
app.get("/", (_req, res) => res.send("OK"));
app.listen(PORT);

// ════════════════════════════════════════════════════════════════
//  БАЗА ДАННЫХ
// ════════════════════════════════════════════════════════════════

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
    db.users[id] = {
      lang: null, name: null, mode: "general", submode: null,
      history: [], tasks: [], clients: [], groupId: null, ready: false,
    };
    saveDB(db);
  }
  return db.users[id];
}
function saveUser(id, u) { const db = loadDB(); db.users[id] = u; saveDB(db); }
function saveGroup(id, d) { const db = loadDB(); db.groups[id] = d; saveDB(db); }
function getGroups() { return loadDB().groups || {}; }

// ════════════════════════════════════════════════════════════════
//  ПЕРЕВОДЫ
// ════════════════════════════════════════════════════════════════

const TX = {
  ru: {
    pickLang:   "🌐 Выберите язык / Tilni tanlang:",
    askName:    "👋 Привет! Я ваш умный бизнес-ассистент.\n\nКак вас зовут?",
    welcome:    (n) => `Приятно познакомиться, *${n}*! 👋\n\nВыберите режим работы:`,
    dashHead:   (n, d, tm) => `👋 *${n}*, добрый день!\n📅 ${d}  🕐 ${tm}\n${"─".repeat(20)}\n\n`,
    tasksHead:  (c) => `📋 *Задачи (${c}):*\n`,
    tasksEmpty: "_нет активных задач_\n",
    tasksHint:  "_/add 14:30 Задача — добавить_\n\n",
    cliHead:    (c) => `👥 *Контакты (${c}):*\n`,
    cliEmpty:   "_пусто — добавьте через 👥 Контакты_\n",
    cliMore:    (n) => `_...ещё ${n}_\n`,
    grpLine:    (t) => `🔗 *Группа:* ${t}\n`,
    chooseMode: "Выберите режим:",
    modeOk:     (l) => `Режим *${l}* выбран`,
    histOk:     "История очищена ✅",
    langOk:     "✅ Язык — Русский",
    noGroup:    "❌ Группа не привязана.\nДобавьте бота в группу → /linkgroup",
    grpNone:    "❌ Бот не добавлен ни в одну группу.\nДобавьте бота в группу → /linkgroup",
    grpChoose:  "Выберите группу:",
    grpLinked:  (t) => `✅ Группа *${t}* привязана!`,
    tagNF:      (n) => `❓ Контакт *${n}* не найден.\nДобавьте через 👥 Контакты`,
    cliNoUser:  (n) => `❌ У *${n}* нет @username`,
    tagSent:    (u, m) => `✅ Отправлено!\n📤 *${u}* — ${m}`,
    tagErr:     "❌ Не удалось отправить в группу.",
    voiceWait:  "🎤 Распознаю...",
    voiceSaid:  (t) => `🎤 *Вы сказали:*\n_${t}_\n\n⏳ Думаю...`,
    voiceErr:   "❌ Не удалось распознать. Попробуйте ещё раз.",
    fileNo:     "📎 Поддерживаю только .xlsx .xls .csv",
    fileRead:   (n) => `📁 Читаю *${n}*...`,
    fileAna:    "📊 Анализирую...",
    fileRes:    (n) => `📁 *${n}*\n\n`,
    fileErr:    "❌ Ошибка чтения файла.",
    sheetLoad:  "📊 Загружаю таблицу...",
    sheetAna:   "🔍 Анализирую...",
    sheetRes:   "📊 *Google Таблица*\n\n",
    sheetErr:   "❌ Не удалось загрузить. Убедитесь что таблица открыта.",
    analyzeQ:   "Проанализируй таблицу: ключевые показатели, тренды, аномалии, рекомендации.",
    timeHint:   "\n\n💡 _/add ЧЧ:ММ Задача — добавить задачу с авто-напоминанием_",
    taskOk:     (n, t, tm) => `✅ Задача #${n}: _${t}_` + (tm ? `\n⏰ *${tm}* — напомню за 1 час!` : ""),
    taskDone:   (t) => `🎉 Выполнено: _${t}_`,
    taskDel:    (t) => `🗑 Удалено: _${t}_`,
    taskNF:     "❌ Задача не найдена.",
    remindSet:  (m, t) => `⏰ Напомню через *${m} мин*:\n_${t}_`,
    remindFire: (t) => `⏰ *Напоминание!*\n\n${t}`,
    remind60:   (t, tm) => `⏰ *Через 1 час:*\n📌 *${t}* — ${tm}`,
    remindNow:  (t, tm) => `🔔 *Пора!* 📌 *${t}* — ${tm}`,
    remindBad:  "❌ Укажите 1–1440 минут.",
    // Контакты
    crmTitle:   "👥 *Контакты*",
    crmEmpty:   "👥 *Контакты пусты*\n\nНажмите «Добавить контакт» чтобы внести первый контакт.",
    crmList:    "👥 *Все контакты:*\n\n",
    crmFoot:    "_/delclient N — удалить_",
    crmAddBtn:  "➕ Добавить контакт",
    crmBackBtn: "◀️ Назад",
    crmDelOk:   (n) => `🗑 Контакт *${n}* удалён.`,
    crmDelNF:   "❌ Контакт не найден.",
    crmS1:      "👤 *Новый контакт*\n\nШаг 1/4 — Имя:",
    crmS2:      (n) => `✅ Имя: *${n}*\n\nШаг 2/4 — Telegram @username\n(или напишите «нет»):`,
    crmS3:      (u) => `✅ Username: ${u||"—"}\n\nШаг 3/4 — Телефон\n(или «нет»):`,
    crmS4:      (p) => `✅ Телефон: ${p||"—"}\n\nШаг 4/4 — Заметка: должность, компания\n(или «нет»):`,
    crmSaved:   (c) => `🎉 *Контакт сохранён!*\n\n👤 ${c.name}\n📱 ${c.username||"—"}\n📞 ${c.phone||"—"}\n📝 ${c.note||"—"}`,
    crmMoreBtn: "➕ Ещё контакт",
    crmDoneBtn: "✅ Готово",
    no:         ["нет", "no", "yo'q", "yoq"],
    kb: [
      ["🤖 Бизнес",  "💡 Идеи",   "✏️ Тексты"],
      ["📈 Аналитик","⚖️ Законы", "🧮 Бухгалтер"],
      ["⏰ Тайм",    "👥 Контакты"],
      ["📋 Задачи",  "🔄 Сброс",  "❓ Помощь"],
    ],
    modeMap: {
      "🤖 Бизнес":"general","💡 Идеи":"brainstorm","✏️ Тексты":"text",
      "📈 Аналитик":"analyst","⚖️ Законы":"law","🧮 Бухгалтер":"accountant","⏰ Тайм":"time",
    },
    btn: { contacts:"👥 Контакты", tasks:"📋 Задачи", help:"❓ Помощь", reset:"🔄 Сброс" },
    help: `*Возможности:*\n\n🤖 Режимы с подразделами\n📁 Excel/CSV файлы\n📊 Google Таблицы\n🎤 Голосовые сообщения\n👥 База контактов\n⏰ Авто-напоминания\n👥 Тегинг в группе\n\n*Задачи:*\n/add 14:30 Встреча\n/done 1 · /del 2 · /remind 30 Текст\n\n*Группа:*\n/linkgroup — привязать\n_"спроси у Имя..."_ — тегнуть\n\n*Язык:* /lang`,
  },
  uz: {
    pickLang:   "🌐 Выберите язык / Tilni tanlang:",
    askName:    "👋 Salom! Men sizning aqlli biznes yordamchingizman.\n\nIsmingiz nima?",
    welcome:    (n) => `Tanishganimdan xursandman, *${n}*! 👋\n\nIsh rejimini tanlang:`,
    dashHead:   (n, d, tm) => `👋 *${n}*, xayrli kun!\n📅 ${d}  🕐 ${tm}\n${"─".repeat(20)}\n\n`,
    tasksHead:  (c) => `📋 *Vazifalar (${c}):*\n`,
    tasksEmpty: "_faol vazifalar yo'q_\n",
    tasksHint:  "_/add 14:30 Vazifa — qo'shish_\n\n",
    cliHead:    (c) => `👥 *Kontaktlar (${c}):*\n`,
    cliEmpty:   "_bo'sh — 👥 Kontaktlar orqali qo'shing_\n",
    cliMore:    (n) => `_...yana ${n} ta_\n`,
    grpLine:    (t) => `🔗 *Guruh:* ${t}\n`,
    chooseMode: "Rejimni tanlang:",
    modeOk:     (l) => `*${l}* rejimi tanlandi`,
    histOk:     "Tarix tozalandi ✅",
    langOk:     "✅ Til — O'zbek",
    noGroup:    "❌ Guruh ulanmagan.\nBotni guruhga qo'shing → /linkgroup",
    grpNone:    "❌ Bot hech bir guruhga qo'shilmagan.\nBotni guruhga qo'shing → /linkgroup",
    grpChoose:  "Guruhni tanlang:",
    grpLinked:  (t) => `✅ *${t}* guruhi ulandi!`,
    tagNF:      (n) => `❓ *${n}* topilmadi.\n👥 Kontaktlar orqali qo'shing`,
    cliNoUser:  (n) => `❌ *${n}* ning @username yo'q`,
    tagSent:    (u, m) => `✅ Yuborildi!\n📤 *${u}* — ${m}`,
    tagErr:     "❌ Guruhga yubora olmadi.",
    voiceWait:  "🎤 Taniyapman...",
    voiceSaid:  (t) => `🎤 *Siz aytdingiz:*\n_${t}_\n\n⏳ O'ylamoqdaman...`,
    voiceErr:   "❌ Ovozni tanib bo'lmadi. Qayta urinib ko'ring.",
    fileNo:     "📎 Faqat .xlsx .xls .csv",
    fileRead:   (n) => `📁 O'qimoqdaman *${n}*...`,
    fileAna:    "📊 Tahlil qilmoqdaman...",
    fileRes:    (n) => `📁 *${n}*\n\n`,
    fileErr:    "❌ Faylni o'qishda xato.",
    sheetLoad:  "📊 Yuklamoqdaman...",
    sheetAna:   "🔍 Tahlil...",
    sheetRes:   "📊 *Google Jadval*\n\n",
    sheetErr:   "❌ Yuklab bo'lmadi. Jadval ochiq bo'lsin.",
    analyzeQ:   "Jadvalni tahlil qil: asosiy ko'rsatkichlar, trendlar, anomaliyalar, tavsiyalar.",
    timeHint:   "\n\n💡 _/add SS:DD Vazifa — avto-eslatma bilan qo'shish_",
    taskOk:     (n, t, tm) => `✅ Vazifa #${n}: _${t}_` + (tm ? `\n⏰ *${tm}* — 1 soat oldin eslataman!` : ""),
    taskDone:   (t) => `🎉 Bajarildi: _${t}_`,
    taskDel:    (t) => `🗑 O'chirildi: _${t}_`,
    taskNF:     "❌ Vazifa topilmadi.",
    remindSet:  (m, t) => `⏰ *${m} daqiqadan* keyin:\n_${t}_`,
    remindFire: (t) => `⏰ *Eslatma!*\n\n${t}`,
    remind60:   (t, tm) => `⏰ *1 soat qoldi:*\n📌 *${t}* — ${tm}`,
    remindNow:  (t, tm) => `🔔 *Vaqt keldi!* 📌 *${t}* — ${tm}`,
    remindBad:  "❌ 1–1440 daqiqa kiriting.",
    crmTitle:   "👥 *Kontaktlar*",
    crmEmpty:   "👥 *Kontaktlar bo'sh*\n\n«Kontakt qo'shish» tugmasini bosing.",
    crmList:    "👥 *Barcha kontaktlar:*\n\n",
    crmFoot:    "_/delclient N — o'chirish_",
    crmAddBtn:  "➕ Kontakt qo'shish",
    crmBackBtn: "◀️ Orqaga",
    crmDelOk:   (n) => `🗑 *${n}* o'chirildi.`,
    crmDelNF:   "❌ Kontakt topilmadi.",
    crmS1:      "👤 *Yangi kontakt*\n\n1/4-qadam — Ism:",
    crmS2:      (n) => `✅ Ism: *${n}*\n\n2/4-qadam — Telegram @username\n(yoki «yo'q» yozing):`,
    crmS3:      (u) => `✅ Username: ${u||"—"}\n\n3/4-qadam — Telefon\n(yoki «yo'q»):`,
    crmS4:      (p) => `✅ Telefon: ${p||"—"}\n\n4/4-qadam — Eslatma: lavozim, kompaniya\n(yoki «yo'q»):`,
    crmSaved:   (c) => `🎉 *Kontakt saqlandi!*\n\n👤 ${c.name}\n📱 ${c.username||"—"}\n📞 ${c.phone||"—"}\n📝 ${c.note||"—"}`,
    crmMoreBtn: "➕ Yana kontakt",
    crmDoneBtn: "✅ Tayyor",
    no:         ["нет", "no", "yo'q", "yoq"],
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
    help: `*Imkoniyatlar:*\n\n🤖 Rejimlar va bo'limlar\n📁 Excel/CSV fayllar\n📊 Google Jadvallar\n🎤 Ovozli xabarlar\n👥 Kontaktlar bazasi\n⏰ Avto-eslatmalar\n👥 Guruhda teglash\n\n*Vazifalar:*\n/add 14:30 Uchrashuv\n/done 1 · /del 2 · /remind 30 Matn\n\n*Guruh:*\n/linkgroup — ulash\n_"Shomaxsuddan so'ra..."_ — teglash\n\n*Til:* /lang`,
  },
};

function T(id)  { const u = getUser(id); return TX[u.lang || "ru"]; }
function kb(id) { return { reply_markup: { keyboard: T(id).kb, resize_keyboard: true } }; }
function pad(n) { return String(n).padStart(2, "0"); }

// ════════════════════════════════════════════════════════════════
//  AI РЕЖИМЫ И ПОДРАЗДЕЛЫ
// ════════════════════════════════════════════════════════════════

function getBaseSystem(modeKey, lang) {
  const uz = lang === "uz";
  const L  = uz ? "o'zbek tilida" : "на русском языке";
  const m  = {
    general:    `Tajribali biznes maslahatchisi. ${L}.`,
    brainstorm: `Ijodiy biznes strateg, g'oyalar generatori. ${L}.`,
    text:       `Professional biznes kopirayter. ${L}.`,
    analyst:    `Moliyaviy tahlilchi. KPI, ROI, EBITDA tahlili. ${L}.`,
    law:        `O'zbekiston huquqshunosi. Konstitutsiya, NK (QQS 12%, foyda 15%, JSHDS 12%, ijt.soliq 12%, INPS 0.1%, aylanma 4%), MK, FK. ${L}.`,
    accountant: `O'zbekiston buxgalteri. INPS=X*0.001, JSHDS=(X-INPS)*0.12, Qo'lga=X-INPS-JSHDS, Ijt=X*0.12. ${L}.`,
    time:       `Vaqt menejment eksperti. Eyzenxauer, Time Blocking, Pomodoro 25+5, Pareto 80/20. ${L}.`,
  };
  return m[modeKey] || m.general;
}

const SUBDEPT_SYSTEM = {
  general_strategy:    "Эксперт по бизнес-стратегии. Бизнес-планы, оргструктура, KPI, управленческие решения.",
  general_marketing:   "Маркетолог. Стратегия, анализ ЦА, позиционирование, рекламные кампании.",
  general_sales:       "Эксперт по продажам. Скрипты, работа с возражениями, переговоры, CRM.",
  general_startup:     "Ментор стартапов. MVP, питч-дек, инвесторы, unit-экономика.",
  general_hr:          "HR-эксперт. Найм, мотивация, онбординг, оценка персонала.",
  brain_product:       "Продуктовый стратег. Идеи продуктов, Jobs-to-be-done, value proposition.",
  brain_marketing:     "Креативный маркетолог. Нестандартные акции, коллаборации, вирусный контент.",
  brain_monetize:      "Эксперт по монетизации. Модели монетизации, upsell, cross-sell, новые источники дохода.",
  brain_content:       "Контент-стратег. Идеи для постов, Reels, TikTok, YouTube, контент-план.",
  brain_innovation:    "Инновационный консультант. Автоматизация, AI-интеграция, технологические улучшения.",
  text_email:          "Деловой копирайтер. Коммерческие предложения, деловая переписка, follow-up письма.",
  text_contract:       "Юридический копирайтер. Договоры, NDA, акты, протоколы, официальные документы.",
  text_social:         "SMM-копирайтер. Посты для Instagram, Telegram, LinkedIn, TikTok с хэштегами и CTA.",
  text_ads:            "Рекламный копирайтер. Объявления, лендинги, заголовки, email-рассылки.",
  text_report:         "Аналитик. Отчёты, презентации, executive summary.",
  analyst_marketplace: "Эксперт по маркетплейсам (Uzum, Wildberries, Ozon, Amazon). Ниши, конкуренты, карточки товаров.",
  analyst_local:       "Аналитик локального рынка Узбекистана. Спрос, конкуренты, цены, тренды.",
  analyst_social:      "SMM-аналитик. Вовлечённость, охваты, конкуренты в соц сетях, рост аудитории.",
  analyst_stocks:      "Аналитик фондового рынка. Акции, P/E, EPS, дивиденды, технический и фундаментальный анализ.",
  analyst_crypto:      "Крипто-аналитик. DeFi, tokenomics, on-chain метрики, технический анализ.",
  law_tax:             "Налоговый консультант РУз. НДС 12%, налог на прибыль 15%, НДФЛ, соц.налог, налог с оборота 4%.",
  law_labor:           "Трудовое право РУз. Договоры, увольнение, отпуска, охрана труда по ТК РУз.",
  law_business:        "Предпринимательское право РУз. ИП, ООО, лицензии, регистрация, господдержка.",
  law_civil:           "Гражданское право РУз. Договоры, обязательства, собственность, наследство.",
  law_customs:         "Таможня и ВЭД РУз. Импорт/экспорт, пошлины, ТН ВЭД коды, валютный контроль.",
  acc_salary:          "Бухгалтер по зарплате. ИНПС=X*0.001, НДФЛ=(X-ИНПС)*0.12, на руки=X-ИНПС-НДФЛ, соц.налог=X*0.12.",
  acc_tax:             "Налоговый бухгалтер РУз. НДС 12%, налог на прибыль 15%, авансы, декларации.",
  acc_balance:         "Финансовый бухгалтер. Баланс, активы/пассивы, коэффициенты ликвидности.",
  acc_cashflow:        "CFO-консультант. Cash Flow, P&L, бюджеты, EBITDA, прогнозы.",
  acc_calc:            "Бухгалтер-калькулятор. Себестоимость, точка безубыточности, маржинальность, ROI.",
  time_day:            "Планировщик дня. Почасовое расписание, Time Blocking, пики энергии, буфер 20%.",
  time_week:           "Планировщик недели. Распределение задач по дням с учётом дедлайнов.",
  time_goals:          "Коуч по целям. SMART-цели, матрица Эйзенхауэра, декомпозиция задач.",
  time_pomodoro:       "Pomodoro-тренер. Планирую сессии 25+5 мин, помогаю сосредоточиться.",
  time_habits:         "Коуч по привычкам. Формирование привычек, трекеры, метод 21 дня.",
};

const SUBDEPTS = {
  general:    { icon:"🤖", ru:{ title:"Бизнес",           subs:[["📊 Стратегия и управление","general_strategy"],["📣 Маркетинг и реклама","general_marketing"],["💰 Продажи и переговоры","general_sales"],["🚀 Стартап и запуск","general_startup"],["👥 HR и команда","general_hr"]] }, uz:{ title:"Biznes", subs:[["📊 Strategiya","general_strategy"],["📣 Marketing","general_marketing"],["💰 Savdo","general_sales"],["🚀 Startup","general_startup"],["👥 HR","general_hr"]] } },
  brainstorm: { icon:"💡", ru:{ title:"Идеи",             subs:[["📦 Продукт / Услуга","brain_product"],["📢 Маркетинговые идеи","brain_marketing"],["💵 Монетизация","brain_monetize"],["🎬 Контент и соц сети","brain_content"],["⚡ Инновации","brain_innovation"]] }, uz:{ title:"G'oyalar", subs:[["📦 Mahsulot","brain_product"],["📢 Marketing g'oyalar","brain_marketing"],["💵 Monetizatsiya","brain_monetize"],["🎬 Kontent","brain_content"],["⚡ Innovatsiya","brain_innovation"]] } },
  text:       { icon:"✏️", ru:{ title:"Тексты",           subs:[["📧 Деловые письма","text_email"],["📃 Договоры и документы","text_contract"],["📱 Посты для соц сетей","text_social"],["📣 Реклама и объявления","text_ads"],["📊 Отчёты и презентации","text_report"]] }, uz:{ title:"Matnlar", subs:[["📧 Xatlar","text_email"],["📃 Shartnomalar","text_contract"],["📱 Postlar","text_social"],["📣 Reklama","text_ads"],["📊 Hisobotlar","text_report"]] } },
  analyst:    { icon:"📈", ru:{ title:"Аналитик",         subs:[["🛒 Маркетплейсы","analyst_marketplace"],["🏪 Местный рынок","analyst_local"],["📊 Анализ соц сетей","analyst_social"],["📉 Фондовый рынок / Акции","analyst_stocks"],["🪙 Криптовалюта","analyst_crypto"]] }, uz:{ title:"Tahlilchi", subs:[["🛒 Marketpleyslar","analyst_marketplace"],["🏪 Mahalliy bozor","analyst_local"],["📊 Ijtimoiy tarmoqlar","analyst_social"],["📉 Aksiyalar","analyst_stocks"],["🪙 Kripto","analyst_crypto"]] } },
  law:        { icon:"⚖️", ru:{ title:"Законы",           subs:[["🧾 Налоговый кодекс","law_tax"],["👷 Трудовое право","law_labor"],["🏢 Предпринимательство","law_business"],["📜 Гражданское право","law_civil"],["🛃 Таможня и ВЭД","law_customs"]] }, uz:{ title:"Qonunlar", subs:[["🧾 Soliq kodeksi","law_tax"],["👷 Mehnat huquqi","law_labor"],["🏢 Tadbirkorlik","law_business"],["📜 Fuqarolik huquqi","law_civil"],["🛃 Bojxona","law_customs"]] } },
  accountant: { icon:"🧮", ru:{ title:"Бухгалтер",        subs:[["💵 Расчёт зарплаты","acc_salary"],["🧾 Налоги","acc_tax"],["📊 Баланс и отчётность","acc_balance"],["💸 Cash Flow и P&L","acc_cashflow"],["🔢 Калькулятор затрат","acc_calc"]] }, uz:{ title:"Hisobchi", subs:[["💵 Ish haqi","acc_salary"],["🧾 Soliqlar","acc_tax"],["📊 Balans","acc_balance"],["💸 Cash Flow","acc_cashflow"],["🔢 Xarajatlar","acc_calc"]] } },
  time:       { icon:"⏰", ru:{ title:"Тайм-менеджмент",  subs:[["📅 План дня","time_day"],["🗓 План недели","time_week"],["🎯 Цели и приоритеты","time_goals"],["🍅 Pomodoro","time_pomodoro"],["✅ Привычки","time_habits"]] }, uz:{ title:"Vaqt menejment", subs:[["📅 Kun rejasi","time_day"],["🗓 Hafta rejasi","time_week"],["🎯 Maqsadlar","time_goals"],["🍅 Pomodoro","time_pomodoro"],["✅ Odatlar","time_habits"]] } },
};

const SUB_WELCOME = {
  general_strategy:    "📊 *Стратегия и управление*\n\nГотов помочь с бизнес-стратегией, оргструктурой и управленческими решениями. Задайте вопрос!",
  general_marketing:   "📣 *Маркетинг и реклама*\n\nПомогу со стратегией, анализом аудитории и рекламными кампаниями. Задайте вопрос!",
  general_sales:       "💰 *Продажи и переговоры*\n\nПомогу со скриптами, возражениями и техниками закрытия сделок. Задайте вопрос!",
  general_startup:     "🚀 *Стартап и запуск*\n\nПомогу с MVP, питч-деком, инвесторами и unit-экономикой. Задайте вопрос!",
  general_hr:          "👥 *HR и команда*\n\nПомогу с наймом, мотивацией и корпоративной культурой. Задайте вопрос!",
  brain_product:       "📦 *Продукт / Услуга*\n\nГенерирую идеи продуктов. Опишите нишу или проблему клиента!",
  brain_marketing:     "📢 *Маркетинговые идеи*\n\nГенерирую нестандартные идеи. Расскажите про ваш бизнес!",
  brain_monetize:      "💵 *Монетизация*\n\nПредложу новые источники дохода. Что у вас есть?",
  brain_content:       "🎬 *Контент и соц сети*\n\nГенерирую идеи для постов. Платформа и тема?",
  brain_innovation:    "⚡ *Инновации*\n\nПредложу автоматизацию и AI-идеи. Что оптимизируем?",
  text_email:          "📧 *Деловые письма*\n\nКому пишем и по какому поводу?",
  text_contract:       "📃 *Договоры и документы*\n\nКакой документ нужен и между кем?",
  text_social:         "📱 *Посты для соц сетей*\n\nПлатформа и тема поста?",
  text_ads:            "📣 *Реклама и объявления*\n\nЧто рекламируем и для кого?",
  text_report:         "📊 *Отчёты и презентации*\n\nЧто за отчёт и для кого?",
  analyst_marketplace: "🛒 *Маркетплейсы*\n\nАнализирую ниши и конкурентов на Uzum, Wildberries, Ozon. Задайте вопрос!",
  analyst_local:       "🏪 *Местный рынок*\n\nАнализирую рынок Узбекистана. Опишите нишу!",
  analyst_social:      "📊 *Анализ соц сетей*\n\nАнализирую вовлечённость и конкурентов. Задайте вопрос!",
  analyst_stocks:      "📉 *Фондовый рынок / Акции*\n\nПомогу с анализом акций. Задайте вопрос!",
  analyst_crypto:      "🪙 *Криптовалюта*\n\nАнализирую крипторынок и DeFi. Задайте вопрос!",
  law_tax:             "🧾 *Налоговый кодекс*\n\nОтвечу по НДС, прибыли, НДФЛ, соц.налогу. Задайте вопрос!",
  law_labor:           "👷 *Трудовое право*\n\nОтвечу по договорам, отпускам, увольнению. Задайте вопрос!",
  law_business:        "🏢 *Предпринимательство*\n\nОтвечу по ИП, ООО, лицензиям. Задайте вопрос!",
  law_civil:           "📜 *Гражданское право*\n\nОтвечу по договорам и обязательствам. Задайте вопрос!",
  law_customs:         "🛃 *Таможня и ВЭД*\n\nОтвечу по импорту, экспорту, пошлинам. Задайте вопрос!",
  acc_salary:          "💵 *Расчёт зарплаты*\n\nНазовите сумму оклада — рассчитаю НДФЛ, ИНПС и сумму на руки.",
  acc_tax:             "🧾 *Налоги*\n\nРассчитаю НДС, прибыль, авансы. Задайте вопрос!",
  acc_balance:         "📊 *Баланс и отчётность*\n\nПомогу с балансом и анализом. Задайте вопрос!",
  acc_cashflow:        "💸 *Cash Flow и P&L*\n\nПомогу составить движение денег. Задайте вопрос!",
  acc_calc:            "🔢 *Калькулятор затрат*\n\nСчитаю себестоимость, маржу, безубыточность. Дайте данные!",
  time_day:            "📅 *План дня*\n\nПеречислите задачи — составлю почасовое расписание!",
  time_week:           "🗓 *План недели*\n\nПеречислите задачи и дедлайны — распределю по дням!",
  time_goals:          "🎯 *Цели и приоритеты*\n\nОпишите цели — расставлю приоритеты и разобью на шаги!",
  time_pomodoro:       "🍅 *Pomodoro*\n\nСколько задач? Составлю план сессий 25+5 мин!",
  time_habits:         "✅ *Привычки*\n\nКакую привычку выработать? Помогу с планом!",
};

function showSubDepts(chatId, modeKey) {
  const lang = getUser(chatId).lang || "ru";
  const d    = SUBDEPTS[modeKey];
  const loc  = lang === "uz" ? d.uz : d.ru;
  const btns = loc.subs.map(([label, id]) => [{ text: label, callback_data: "sub_" + id }]);
  bot.sendMessage(chatId,
    d.icon + " *" + loc.title + "*\n\nВыберите направление:",
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: btns } }
  );
}

// ════════════════════════════════════════════════════════════════
//  AI ЗАПРОС
// ════════════════════════════════════════════════════════════════

async function ai(chatId, msg, ctx = "") {
  const u    = getUser(chatId);
  const lang = u.lang || "ru";
  const langSuffix = lang === "uz" ? " O'zbek tilida javob ber." : " Отвечай на русском языке.";
  const sys  = (u.submode && SUBDEPT_SYSTEM[u.submode])
    ? SUBDEPT_SYSTEM[u.submode] + langSuffix
    : getBaseSystem(u.mode || "general", lang);
  const body = ctx ? ctx + "\n\n" + msg : msg;
  const h    = u.history || [];
  h.push({ role: "user", content: body });
  if (h.length > 20) h.splice(0, h.length - 20);
  const r = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1500,
    messages: [{ role: "system", content: sys }, ...h],
  });
  const reply = r.choices[0].message.content;
  h.push({ role: "assistant", content: reply });
  u.history = h;
  saveUser(chatId, u);
  return reply;
}

async function sendLong(chatId, text) {
  const opts = { parse_mode: "Markdown", ...kb(chatId) };
  if (text.length <= 4000) return bot.sendMessage(chatId, text, opts);
  for (let i = 0; i < text.length; i += 4000)
    await bot.sendMessage(chatId, text.slice(i, i + 4000), opts);
}

// ════════════════════════════════════════════════════════════════
//  ДАШБОРД
// ════════════════════════════════════════════════════════════════

function showDashboard(chatId) {
  const t = T(chatId);
  const u = getUser(chatId);
  const now = new Date();
  const d   = pad(now.getDate()) + "." + pad(now.getMonth()+1) + "." + now.getFullYear();
  const tm  = pad(now.getHours()) + ":" + pad(now.getMinutes());
  const tasks   = (u.tasks   || []).filter(x => !x.done).sort((a,b) => a.time && b.time ? a.time.localeCompare(b.time) : a.time ? -1 : 1);
  const clients = u.clients || [];
  let txt = t.dashHead(u.name, d, tm);
  txt += t.tasksHead(tasks.length);
  if (!tasks.length) txt += t.tasksEmpty;
  else tasks.forEach((tk, i) => { txt += (i+1) + ". " + (tk.time ? "🕐 " + tk.time + " " : "") + tk.text + "\n"; });
  txt += t.tasksHint;
  txt += t.cliHead(clients.length);
  if (!clients.length) txt += t.cliEmpty;
  else {
    clients.slice(0,5).forEach(c => { txt += "• " + c.name + (c.username ? " " + c.username : "") + (c.phone ? " · " + c.phone : "") + "\n"; });
    if (clients.length > 5) txt += t.cliMore(clients.length - 5);
  }
  if (u.groupId) { const g = getGroups()[u.groupId]; if (g) txt += "\n" + t.grpLine(g.title); }
  txt += "\n" + t.chooseMode;
  bot.sendMessage(chatId, txt, { parse_mode: "Markdown", ...kb(chatId) });
}

// ════════════════════════════════════════════════════════════════
//  ОНБОРДИНГ
// ════════════════════════════════════════════════════════════════

const waitingName = new Set();
const waitingCRM  = new Map();

function showLangPicker(chatId) {
  bot.sendMessage(chatId, TX.ru.pickLang, {
    reply_markup: { inline_keyboard: [
      [{ text: "🇷🇺 Русский",     callback_data: "lang_ru" }],
      [{ text: "🇺🇿 O'zbek tili", callback_data: "lang_uz" }],
    ]},
  });
}

bot.onText(/\/start/, (msg) => {
  const id = msg.chat.id;
  const u  = getUser(id);
  if (!u.lang)  return showLangPicker(id);
  if (!u.ready) { waitingName.add(id); return bot.sendMessage(id, T(id).askName, { reply_markup: { remove_keyboard: true } }); }
  showDashboard(id);
});

bot.onText(/\/lang/, (msg) => showLangPicker(msg.chat.id));

// ════════════════════════════════════════════════════════════════
//  КОНТАКТЫ — только через кнопку
// ════════════════════════════════════════════════════════════════

function showContacts(chatId) {
  const t  = T(chatId);
  const u  = getUser(chatId);
  const cl = u.clients || [];
  if (!cl.length) {
    return bot.sendMessage(chatId, t.crmEmpty, {
      parse_mode: "Markdown",
      reply_markup: { inline_keyboard: [
        [{ text: t.crmAddBtn, callback_data: "crm_add" }],
      ]},
    });
  }
  let txt = t.crmList;
  cl.forEach((c, i) => {
    txt += "*" + (i+1) + ". " + c.name + "*\n";
    if (c.username) txt += "   📱 " + c.username + "\n";
    if (c.phone)    txt += "   📞 " + c.phone + "\n";
    if (c.note)     txt += "   📝 " + c.note + "\n";
    txt += "\n";
  });
  txt += t.crmFoot;
  bot.sendMessage(chatId, txt, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: [[{ text: t.crmAddBtn, callback_data: "crm_add" }]] },
  });
}

function startCRM(chatId) {
  waitingCRM.set(chatId, { step: "name" });
  bot.sendMessage(chatId, T(chatId).crmS1, { parse_mode: "Markdown", reply_markup: { remove_keyboard: true } });
}

async function handleCRM(chatId, text) {
  const s = waitingCRM.get(chatId);
  if (!s) return false;
  const t  = T(chatId);
  const no = (v) => t.no.includes(v.toLowerCase().trim());

  if (s.step === "name")     { s.name = text; s.step = "username"; bot.sendMessage(chatId, t.crmS2(text), { parse_mode:"Markdown" }); return true; }
  if (s.step === "username") { s.username = no(text) ? null : (text.startsWith("@") ? text : "@" + text); s.step = "phone"; bot.sendMessage(chatId, t.crmS3(s.username), { parse_mode:"Markdown" }); return true; }
  if (s.step === "phone")    { s.phone = no(text) ? null : text; s.step = "note"; bot.sendMessage(chatId, t.crmS4(s.phone), { parse_mode:"Markdown" }); return true; }
  if (s.step === "note") {
    s.note = no(text) ? null : text;
    waitingCRM.delete(chatId);
    const u = getUser(chatId);
    u.clients = u.clients || [];
    u.clients.push({ id: Date.now(), name: s.name, username: s.username, phone: s.phone, note: s.note });
    saveUser(chatId, u);
    bot.sendMessage(chatId, t.crmSaved(s), { parse_mode: "Markdown" });
    bot.sendMessage(chatId, "➕", {
      reply_markup: { inline_keyboard: [
        [{ text: t.crmMoreBtn, callback_data: "crm_add"  }],
        [{ text: t.crmDoneBtn, callback_data: "crm_done" }],
      ]},
    });
    return true;
  }
  return false;
}

bot.onText(/\/newclient/, (msg) => startCRM(msg.chat.id));
bot.onText(/\/clients/,   (msg) => showContacts(msg.chat.id));
bot.onText(/\/delclient (\d+)/, (msg, match) => {
  const id = msg.chat.id; const t = T(id);
  const u = getUser(id); const i = +match[1] - 1;
  if (!u.clients || i < 0 || i >= u.clients.length) return bot.sendMessage(id, t.crmDelNF, kb(id));
  const name = u.clients.splice(i, 1)[0].name;
  saveUser(id, u);
  bot.sendMessage(id, t.crmDelOk(name), { parse_mode:"Markdown", ...kb(id) });
});

// ════════════════════════════════════════════════════════════════
//  ЗАДАЧИ
// ════════════════════════════════════════════════════════════════

function parseTime(s) {
  const m = s.match(/(\d{1,2})[:.]+(\d{2})/);
  if (!m) return null;
  const h = +m[1], mn = +m[2];
  if (h > 23 || mn > 59) return null;
  return { h, m: mn };
}

bot.onText(/\/add (.+)/, (msg, match) => {
  const id = msg.chat.id; const t = T(id);
  const u = getUser(id); u.tasks = u.tasks || [];
  const raw = match[1].trim();
  const tm  = raw.match(/^(\d{1,2}[:.]\d{2})\s+(.*)/);
  let text, time;
  if (tm) { const p = parseTime(tm[1]); if (p) { time = pad(p.h)+":"+pad(p.m); text = tm[2]; } else text = raw; }
  else text = raw;
  u.tasks.push({ id: Date.now(), text, time: time||null, done: false, r60: false, r0: false });
  saveUser(id, u);
  bot.sendMessage(id, t.taskOk(u.tasks.length, text, time), { parse_mode:"Markdown", ...kb(id) });
});

bot.onText(/\/done (\d+)/, (msg, match) => {
  const id = msg.chat.id; const t = T(id); const u = getUser(id); const i = +match[1]-1;
  if (!u.tasks || i < 0 || i >= u.tasks.length) return bot.sendMessage(id, t.taskNF, kb(id));
  u.tasks[i].done = true; saveUser(id, u);
  bot.sendMessage(id, t.taskDone(u.tasks[i].text), { parse_mode:"Markdown", ...kb(id) });
});

bot.onText(/\/del (\d+)/, (msg, match) => {
  const id = msg.chat.id; const t = T(id); const u = getUser(id); const i = +match[1]-1;
  if (!u.tasks || i < 0 || i >= u.tasks.length) return bot.sendMessage(id, t.taskNF, kb(id));
  const name = u.tasks.splice(i, 1)[0].text; saveUser(id, u);
  bot.sendMessage(id, t.taskDel(name), { parse_mode:"Markdown", ...kb(id) });
});

bot.onText(/\/remind (\d+) (.+)/, (msg, match) => {
  const id = msg.chat.id; const t = T(id);
  const min = +match[1]; const txt = match[2].trim();
  if (min < 1 || min > 1440) return bot.sendMessage(id, t.remindBad, kb(id));
  setTimeout(() => bot.sendMessage(id, t.remindFire(txt), { parse_mode:"Markdown", ...kb(id) }), min * 60000);
  bot.sendMessage(id, t.remindSet(min, txt), { parse_mode:"Markdown", ...kb(id) });
});

function showTasks(chatId) {
  const t = T(chatId); const u = getUser(chatId);
  const tasks = u.tasks || [];
  const pending = tasks.filter(x => !x.done);
  const done    = tasks.filter(x => x.done);
  if (!tasks.length) return bot.sendMessage(chatId, "📋 " + (u.lang==="uz" ? "*Vazifalar yo'q*\n\n/add 14:30 Uchrashuv" : "*Задач нет*\n\n/add 14:30 Встреча"), { parse_mode:"Markdown", ...kb(chatId) });
  let txt = "";
  if (pending.length) { txt += "📋 *" + pending.length + ":*\n"; tasks.forEach((tk,i) => { if (!tk.done) txt += (i+1) + ". " + (tk.time ? "🕐 "+tk.time+" " : "") + tk.text + "\n"; }); }
  if (done.length)    { txt += "\n✅ *" + done.length + ":*\n"; tasks.forEach((tk,i) => { if (tk.done) txt += (i+1) + ". ~" + tk.text + "~\n"; }); }
  txt += "\n_/done N · /del N_";
  sendLong(chatId, txt);
}

// Авто-напоминания каждую минуту
setInterval(() => {
  const db = loadDB();
  const now = new Date();
  const nowM = now.getHours()*60 + now.getMinutes();
  let changed = false;
  Object.entries(db.users).forEach(([id, u]) => {
    if (!u.tasks) return;
    const t = TX[u.lang || "ru"];
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

// ════════════════════════════════════════════════════════════════
//  ГРУППЫ И ТЕГИНГ
// ════════════════════════════════════════════════════════════════

const pendingReplies = new Map();

bot.on("my_chat_member", (upd) => {
  const c = upd.chat;
  if ((c.type==="group"||c.type==="supergroup") && ["member","administrator"].includes(upd.new_chat_member?.status))
    saveGroup(String(c.id), { id: c.id, title: c.title });
});

bot.onText(/\/linkgroup/, (msg) => {
  const id = msg.chat.id; const t = T(id);
  const gs = Object.values(getGroups());
  if (!gs.length) return bot.sendMessage(id, t.grpNone, { parse_mode:"Markdown", ...kb(id) });
  bot.sendMessage(id, t.grpChoose, { reply_markup: { inline_keyboard: gs.map(g => [{ text: g.title, callback_data: "grp_" + g.id }]) } });
});

function parseTag(text) {
  const pp = [
    /(?:спроси\s+у|спроси|ask)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:напомни|скажи|remind|тегни|ping)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
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
    const owner = u.name || "Директор";
    const grpTxt = u.lang === "uz"
      ? owner + " so'rayapti, " + cl.username + " — " + req.msg
      : "Ваш " + owner + " спрашивает, " + cl.username + " — " + req.msg;
    await bot.sendMessage(u.groupId, grpTxt);
    const key = u.groupId + ":" + cl.username.toLowerCase();
    pendingReplies.set(key, { ownerChatId: chatId, clientName: cl.name, lang: u.lang||"ru" });
    setTimeout(() => pendingReplies.delete(key), 24*60*60*1000);
    bot.sendMessage(chatId, t.tagSent(cl.username, req.msg), { parse_mode:"Markdown", ...kb(chatId) });
  } catch (_) { bot.sendMessage(chatId, t.tagErr, kb(chatId)); }
}

// Слушаем ответы в группах
bot.on("message", (msg) => {
  if (msg.chat.type !== "group" && msg.chat.type !== "supergroup") return;
  if (!msg.text || !msg.from?.username) return;
  const key = String(msg.chat.id) + ":@" + msg.from.username.toLowerCase();
  const p   = pendingReplies.get(key);
  if (!p) return;
  const text  = msg.text.trim().toLowerCase();
  const isYes = ["да","yes","ha","ok","ок","готово","tayyor","done","сделал","сделала","готов","готова"].some(w => text === w || text.startsWith(w));
  const isNo  = ["нет","no","yo'q","yoq","не готово","ещё нет","hali","не сделал"].some(w => text === w || text.startsWith(w));
  if (isYes) {
    pendingReplies.delete(key);
    bot.sendMessage(p.ownerChatId, (p.lang==="uz" ? "✅ *"+p.clientName+"* javob berdi: *Ha*, tayyor!" : "✅ *"+p.clientName+"* ответил(а): *Да*, готово!"), { parse_mode:"Markdown" });
  } else if (isNo) {
    pendingReplies.delete(key);
    bot.sendMessage(p.ownerChatId, (p.lang==="uz" ? "❌ *"+p.clientName+"* javob berdi: *Yo'q*." : "❌ *"+p.clientName+"* ответил(а): *Нет*, ещё не готово."), { parse_mode:"Markdown" });
  } else {
    bot.sendMessage(p.ownerChatId, "💬 *"+p.clientName+"* спрашивает у вас:\n_\""+msg.text+"\"_", { parse_mode:"Markdown" });
  }
});

// ════════════════════════════════════════════════════════════════
//  ГОЛОС — через FormData напрямую в Groq API
// ════════════════════════════════════════════════════════════════

bot.on("voice", async (msg) => {
  const id = msg.chat.id;
  const t  = T(id);
  const st = await bot.sendMessage(id, t.voiceWait);
  bot.sendChatAction(id, "typing");

  const fp = path.join("/tmp", "voice_" + msg.voice.file_id + ".ogg");

  try {
    // 1. Получаем ссылку на файл от Telegram
    const fileInfo = await bot.getFile(msg.voice.file_id);
    const fileUrl  = "https://api.telegram.org/file/bot" + TELEGRAM_TOKEN + "/" + fileInfo.file_path;

    // 2. Скачиваем аудио файл
    const dlResp = await axios({
      url:          fileUrl,
      method:       "GET",
      responseType: "arraybuffer",
      timeout:      20000,
    });
    fs.writeFileSync(fp, Buffer.from(dlResp.data));

    // 3. Отправляем в Groq Whisper через FormData (самый надёжный способ)
    const form = new FormData();
    form.append("file", fs.createReadStream(fp), {
      filename:    "voice.ogg",
      contentType: "audio/ogg",
    });
    form.append("model",           "whisper-large-v3-turbo");
    form.append("language",        getUser(id).lang === "uz" ? "uz" : "ru");
    form.append("response_format", "text");

    const whisperResp = await axios.post(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      form,
      {
        headers: {
          "Authorization": "Bearer " + GROQ_API_KEY,
          ...form.getHeaders(),
        },
        timeout: 30000,
      }
    );

    fs.unlink(fp, () => {});

    // response_format:text возвращает строку напрямую
    const recognized = (typeof whisperResp.data === "string"
      ? whisperResp.data
      : whisperResp.data.text || ""
    ).trim();

    if (!recognized) {
      return bot.editMessageText(t.voiceErr, { chat_id: id, message_id: st.message_id });
    }

    // 4. Показываем расшифровку
    await bot.editMessageText(
      t.voiceSaid(recognized),
      { chat_id: id, message_id: st.message_id, parse_mode: "Markdown" }
    );

    // 5. Тегинг?
    const tag = parseTag(recognized);
    if (tag) { await bot.deleteMessage(id, st.message_id); return doTag(id, tag); }

    // 6. Ответ ИИ
    const reply = await ai(id, recognized);
    await bot.deleteMessage(id, st.message_id);
    sendLong(id, "🎤 _" + recognized + "_\n\n" + reply);

  } catch (e) {
    console.error("VOICE ERROR:", e.response?.data || e.message);
    try { fs.unlinkSync(fp); } catch (_) {}
    bot.editMessageText(t.voiceErr, { chat_id: id, message_id: st.message_id });
  }
});

// ════════════════════════════════════════════════════════════════
//  ФАЙЛЫ Excel / CSV
// ════════════════════════════════════════════════════════════════

async function dlFile(fileId) {
  const info = await bot.getFile(fileId);
  const url  = "https://api.telegram.org/file/bot" + TELEGRAM_TOKEN + "/" + info.file_path;
  const tmp  = path.join("/tmp", "f_" + fileId + path.extname(info.file_path));
  const r    = await axios({ url, responseType: "arraybuffer", timeout: 20000 });
  fs.writeFileSync(tmp, Buffer.from(r.data));
  return tmp;
}

bot.on("document", async (msg) => {
  const id = msg.chat.id; const t = T(id);
  const doc = msg.document; const name = doc.file_name || "";
  if (![".xlsx",".xls",".csv"].some(e => name.endsWith(e))) return bot.sendMessage(id, t.fileNo, kb(id));
  const st = await bot.sendMessage(id, t.fileRead(name), { parse_mode:"Markdown" });
  bot.sendChatAction(id, "typing");
  try {
    const fp = await dlFile(doc.file_id);
    const wb = XLSX.readFile(fp); let data = "";
    wb.SheetNames.forEach(s => { data += "\n=== " + s + " ===\n"; XLSX.utils.sheet_to_json(wb.Sheets[s],{header:1}).slice(0,100).forEach(r => { data += r.join(" | ") + "\n"; }); });
    fs.unlink(fp, () => {});
    data = data.slice(0, 8000);
    await bot.editMessageText(t.fileAna, { chat_id:id, message_id:st.message_id });
    const u = getUser(id); const prev = u.mode; u.mode = "analyst"; saveUser(id, u);
    const reply = await ai(id, msg.caption || t.analyzeQ, "\"" + name + "\":\n```\n" + data + "\n```");
    u.mode = prev; saveUser(id, u);
    await bot.deleteMessage(id, st.message_id);
    sendLong(id, t.fileRes(name) + reply);
  } catch (e) { console.error("File error:", e.message); bot.editMessageText(t.fileErr, { chat_id:id, message_id:st.message_id }); }
});

// ════════════════════════════════════════════════════════════════
//  CALLBACK QUERY
// ════════════════════════════════════════════════════════════════

bot.on("callback_query", async (q) => {
  const id = q.message.chat.id;
  bot.answerCallbackQuery(q.id);
  const d = q.data;

  if (d === "lang_ru" || d === "lang_uz") {
    const lang = d === "lang_ru" ? "ru" : "uz";
    const u = getUser(id); u.lang = lang; saveUser(id, u);
    if (!u.ready) { waitingName.add(id); return bot.sendMessage(id, TX[lang].askName, { reply_markup: { remove_keyboard: true } }); }
    return bot.sendMessage(id, TX[lang].langOk, { parse_mode:"Markdown", ...kb(id) });
  }

  if (d === "crm_add")  { startCRM(id); return; }
  if (d === "crm_done") { showDashboard(id); return; }

  if (d.startsWith("sub_")) {
    const subId = d.replace("sub_", "");
    const u = getUser(id); u.submode = subId; u.history = []; saveUser(id, u);
    const welcome = SUB_WELCOME[subId] || "Раздел выбран. Задайте вопрос!";
    return bot.sendMessage(id, welcome, { parse_mode:"Markdown", ...kb(id) });
  }

  if (d.startsWith("grp_")) {
    const gid = d.replace("grp_", ""); const g = getGroups()[gid];
    const u = getUser(id); u.groupId = gid; saveUser(id, u);
    bot.sendMessage(id, T(id).grpLinked(g.title), { parse_mode:"Markdown", ...kb(id) });
  }
});

// ════════════════════════════════════════════════════════════════
//  ГЛАВНЫЙ ОБРАБОТЧИК ТЕКСТА
// ════════════════════════════════════════════════════════════════

bot.on("message", async (msg) => {
  const id   = msg.chat.id;
  const text = msg.text;
  if (!text) return;
  if (msg.chat.type === "group" || msg.chat.type === "supergroup") return; // группы обрабатываются выше

  const u = getUser(id);
  if (!u.lang) return showLangPicker(id);
  const t = T(id);

  // Онбординг — ввод имени
  if (waitingName.has(id)) {
    waitingName.delete(id);
    u.name = text.trim(); u.ready = true; saveUser(id, u);
    return bot.sendMessage(id, t.welcome(u.name), { parse_mode:"Markdown", ...kb(id) });
  }

  // CRM шаги
  if (waitingCRM.has(id)) { if (await handleCRM(id, text)) return; }

  // Режимы → подразделы
  const modeKey = t.modeMap[text];
  if (modeKey) {
    u.mode = modeKey; u.submode = null; u.history = []; saveUser(id, u);
    showSubDepts(id, modeKey);
    return;
  }

  if (text === t.btn.contacts) return showContacts(id);
  if (text === t.btn.tasks)    return showTasks(id);
  if (text === t.btn.help)     return bot.sendMessage(id, t.help, { parse_mode:"Markdown", ...kb(id) });
  if (text === t.btn.reset)    { u.history = []; u.submode = null; saveUser(id, u); return bot.sendMessage(id, t.histOk, kb(id)); }
  if (text.startsWith("/"))    return;

  // Google Sheets
  if (text.includes("docs.google.com/spreadsheets")) {
    const st = await bot.sendMessage(id, t.sheetLoad);
    bot.sendChatAction(id, "typing");
    try {
      const m = text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/); if (!m) throw new Error();
      const r = await axios.get("https://docs.google.com/spreadsheets/d/" + m[1] + "/export?format=csv", { responseType:"text", timeout:15000 });
      await bot.editMessageText(t.sheetAna, { chat_id:id, message_id:st.message_id });
      const prev = u.mode; u.mode = "analyst"; saveUser(id, u);
      const reply = await ai(id, t.analyzeQ, "```\n" + r.data.slice(0,8000) + "\n```");
      u.mode = prev; saveUser(id, u);
      await bot.deleteMessage(id, st.message_id);
      sendLong(id, t.sheetRes + reply);
    } catch (_) { bot.editMessageText(t.sheetErr, { chat_id:id, message_id:st.message_id }); }
    return;
  }

  // Тегинг
  const tag = parseTag(text);
  if (tag) return doTag(id, tag);

  // Обычный вопрос
  bot.sendChatAction(id, "typing");
  try {
    const reply = await ai(id, text);
    sendLong(id, reply + (u.mode === "time" ? t.timeHint : ""));
  } catch (e) {
    console.error("AI error:", e.message);
    bot.sendMessage(id, "❌ Ошибка. Попробуйте ещё раз.", kb(id));
  }
});

console.log("✅ Бот запущен!");
