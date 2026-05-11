// ──────────────────────────────────────────────────────────
//  ЗАВИСИМОСТИ
// ──────────────────────────────────────────────────────────
const TelegramBot = require("node-telegram-bot-api");
const Groq        = require("groq-sdk");
const axios       = require("axios");
const FormData    = require("form-data");
const XLSX        = require("xlsx");
const express     = require("express");
const fs          = require("fs");
const path        = require("path");

// ──────────────────────────────────────────────────────────
//  КОНФИГ
// ──────────────────────────────────────────────────────────
const TOKEN    = process.env.TELEGRAM_TOKEN;
const GROQ_KEY = process.env.GROQ_API_KEY;
const PORT     = process.env.PORT || 3000;
const DB       = path.join("/tmp", "db.json");

if (!TOKEN || !GROQ_KEY) {
  console.error("ERROR: TELEGRAM_TOKEN or GROQ_API_KEY missing");
  process.exit(1);
}

const bot  = new TelegramBot(TOKEN, { polling: true });
const groq = new Groq({ apiKey: GROQ_KEY });

// Render health-check
const app = express();
app.get("/",    (_q, r) => r.send("OK"));
app.get("/ping",(_q, r) => r.send("pong"));
app.listen(PORT, () => console.log("HTTP on", PORT));

// Кешируем username бота при старте
let BOT_USERNAME = "";
bot.getMe().then(me => { BOT_USERNAME = me.username; console.log("Bot:", BOT_USERNAME); });

// ──────────────────────────────────────────────────────────
//  БД
// ──────────────────────────────────────────────────────────
function loadDB() {
  try { if (fs.existsSync(DB)) return JSON.parse(fs.readFileSync(DB, "utf8")); } catch (_) {}
  return { users: {}, groups: {} };
}
function saveDB(db) { try { fs.writeFileSync(DB, JSON.stringify(db)); } catch (_) {} }

function getUser(id) {
  const db = loadDB();
  if (!db.users[id]) {
    db.users[id] = { lang: null, name: null, mode: "general", submode: null,
                     history: [], tasks: [], clients: [], groupId: null, ready: false };
    saveDB(db);
  }
  return db.users[id];
}
function saveUser(id, u)  { const db = loadDB(); db.users[id] = u; saveDB(db); }
function saveGroup(id, d) { const db = loadDB(); db.groups[id] = d; saveDB(db); }
function getGroups()      { return loadDB().groups || {}; }

// ──────────────────────────────────────────────────────────
//  ВСПОМОГАЛКИ
// ──────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }
function T(id)  { const u = getUser(id); return TX[u.lang || "ru"]; }
function kb(id) { return { reply_markup: { keyboard: T(id).kb, resize_keyboard: true } }; }

async function sendLong(chatId, text, opts) {
  const o = { parse_mode: "Markdown", ...kb(chatId), ...(opts || {}) };
  if (text.length <= 4000) return bot.sendMessage(chatId, text, o);
  for (let i = 0; i < text.length; i += 4000)
    await bot.sendMessage(chatId, text.slice(i, i + 4000), o);
}

// ──────────────────────────────────────────────────────────
//  ПЕРЕВОДЫ
// ──────────────────────────────────────────────────────────
const TX = {
  ru: {
    pickLang: "Выберите язык / Tilni tanlang:",
    askName:  "Привет! Я ваш бизнес-ассистент.\n\nКак вас зовут?",
    welcome:  n => "Приятно познакомиться, *" + n + "*!\n\nВыберите режим:",
    dashHead: (n,d,t) => "*" + n + "*, добрый день!\n" + d + "  " + t + "\n" + "─".repeat(20) + "\n\n",
    tHead:    c => "*Задачи (" + c + "):*\n",
    tEmpty:   "_нет задач_\n",
    tHint:    "_/add 14:30 Задача_\n\n",
    cHead:    c => "*Контакты (" + c + "):*\n",
    cEmpty:   "_пусто — кнопка 👥 Контакты_\n",
    cMore:    n => "_...ещё " + n + "_\n",
    gLine:    t => "*Группа:* " + t + "\n",
    modeLabel:"Выберите режим:",
    histOk:   "История очищена ✅",
    langOk:   "Язык — Русский ✅",
    noGroup:  "Группа не привязана.\n/linkgroup — привязать",
    grpNone:  "Бот не добавлен в группу.\nДобавьте бота в группу → /linkgroup",
    grpPick:  "Выберите группу:",
    grpOk:    t => "Группа *" + t + "* привязана!",
    tagNF:    n => "Контакт *" + n + "* не найден.\nДобавьте через 👥 Контакты",
    noUser:   n => "У *" + n + "* нет @username",
    tagSent:  (u,m) => "Отправлено!\n*" + u + "* — " + m,
    tagErr:   "Не удалось отправить в группу.",
    voiceWait:"🎤 Распознаю...",
    voiceSaid:t => "🎤 *Вы сказали:*\n_" + t + "_\n\n⏳ Думаю...",
    voiceErr: "Не удалось распознать. Попробуйте ещё раз.",
    fileNo:   "Поддерживаю только .xlsx .xls .csv",
    fileRead: n => "Читаю *" + n + "*...",
    fileAna:  "Анализирую...",
    fileRes:  n => "*" + n + "*\n\n",
    fileErr:  "Ошибка чтения файла.",
    shLoad:   "Загружаю таблицу...",
    shAna:    "Анализирую...",
    shRes:    "*Google Таблица*\n\n",
    shErr:    "Не удалось загрузить. Таблица должна быть открыта.",
    analyzeQ: "Проанализируй таблицу: показатели, тренды, аномалии, рекомендации.",
    tOk:      (n,t,tm) => "Задача #" + n + ": _" + t + "_" + (tm ? "\n⏰ *" + tm + "* — напомню за 1 час!" : ""),
    tDone:    t => "Выполнено: _" + t + "_",
    tDel:     t => "Удалено: _" + t + "_",
    tNF:      "Задача не найдена.",
    remSet:   (m,t) => "Напомню через *" + m + " мин*:\n_" + t + "_",
    remFire:  t => "*Напоминание!*\n\n" + t,
    rem60:    (t,tm) => "*Через 1 час:* " + t + " — " + tm,
    rem0:     (t,tm) => "*Пора!* " + t + " — " + tm,
    remBad:   "Укажите 1–1440 минут.",
    cEmpty2:  "*Контакты пусты*\n\nНажмите кнопку ниже чтобы добавить.",
    cList:    "*Все контакты:*\n\n",
    cFoot:    "_/delclient N — удалить_",
    cAddBtn:  "➕ Добавить контакт",
    cDelOk:   n => "Контакт *" + n + "* удалён.",
    cDelNF:   "Контакт не найден.",
    cS1:      "*Новый контакт*\n\nШаг 1/4 — Имя:",
    cS2:      n => "Имя: *" + n + "*\n\nШаг 2/4 — @username (или «нет»):",
    cS3:      u => "Username: " + (u||"—") + "\n\nШаг 3/4 — Телефон (или «нет»):",
    cS4:      p => "Телефон: " + (p||"—") + "\n\nШаг 4/4 — Заметка (или «нет»):",
    cSaved:   c => "Контакт сохранён!\n\n" + c.name + "\n" + (c.username||"—") + "\n" + (c.phone||"—"),
    cMore:    "➕ Ещё контакт",
    cDone:    "✅ Готово",
    no:       ["нет","no","yo'q","yoq"],
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
    btn: { c:"👥 Контакты", t:"📋 Задачи", h:"❓ Помощь", r:"🔄 Сброс" },
    help: "*Возможности:*\n\n*Личка — полный функционал:*\n• Режимы с подразделами\n• Excel/CSV, Google Sheets\n• Голос 🎤\n• Контакты CRM\n• Авто-напоминания\n• Тегинг в группе\n\n*Группа — команды:*\n/menu — меню режимов\n/analyst /business /ideas\n/law /accountant /time\n@бот вопрос — ответ ИИ\n\n*Задачи:*\n/add 14:30 Встреча\n/done 1 · /del 2 · /remind 30 Текст\n\n/linkgroup — привязать группу\n/lang — сменить язык",
  },
  uz: {
    pickLang: "Выберите язык / Tilni tanlang:",
    askName:  "Salom! Men biznes yordamchingizman.\n\nIsmingiz nima?",
    welcome:  n => "Tanishganimdan xursandman, *" + n + "*!\n\nRejimni tanlang:",
    dashHead: (n,d,t) => "*" + n + "*, xayrli kun!\n" + d + "  " + t + "\n" + "─".repeat(20) + "\n\n",
    tHead:    c => "*Vazifalar (" + c + "):*\n",
    tEmpty:   "_vazifa yo'q_\n",
    tHint:    "_/add 14:30 Vazifa_\n\n",
    cHead:    c => "*Kontaktlar (" + c + "):*\n",
    cEmpty:   "_bo'sh — 👥 Kontaktlar tugmasi_\n",
    cMore:    n => "_...yana " + n + " ta_\n",
    gLine:    t => "*Guruh:* " + t + "\n",
    modeLabel:"Rejimni tanlang:",
    histOk:   "Tarix tozalandi ✅",
    langOk:   "Til — O'zbek ✅",
    noGroup:  "Guruh ulanmagan.\n/linkgroup — ulash",
    grpNone:  "Bot guruhga qo'shilmagan.\nBotni guruhga qo'shing → /linkgroup",
    grpPick:  "Guruhni tanlang:",
    grpOk:    t => "*" + t + "* guruhi ulandi!",
    tagNF:    n => "*" + n + "* topilmadi.\n👥 Kontaktlar orqali qo'shing",
    noUser:   n => "*" + n + "* ning @username yo'q",
    tagSent:  (u,m) => "Yuborildi!\n*" + u + "* — " + m,
    tagErr:   "Guruhga yubora olmadi.",
    voiceWait:"🎤 Taniyapman...",
    voiceSaid:t => "🎤 *Siz aytdingiz:*\n_" + t + "_\n\n⏳ O'ylamoqdaman...",
    voiceErr: "Ovozni tanib bo'lmadi. Qayta urinib ko'ring.",
    fileNo:   "Faqat .xlsx .xls .csv",
    fileRead: n => "*" + n + "* o'qimoqdaman...",
    fileAna:  "Tahlil qilmoqdaman...",
    fileRes:  n => "*" + n + "*\n\n",
    fileErr:  "Faylni o'qishda xato.",
    shLoad:   "Yuklamoqdaman...",
    shAna:    "Tahlil...",
    shRes:    "*Google Jadval*\n\n",
    shErr:    "Yuklab bo'lmadi. Jadval ochiq bo'lsin.",
    analyzeQ: "Jadvalni tahlil qil: ko'rsatkichlar, trendlar, anomaliyalar, tavsiyalar.",
    tOk:      (n,t,tm) => "Vazifa #" + n + ": _" + t + "_" + (tm ? "\n⏰ *" + tm + "* — 1 soat oldin eslataman!" : ""),
    tDone:    t => "Bajarildi: _" + t + "_",
    tDel:     t => "O'chirildi: _" + t + "_",
    tNF:      "Vazifa topilmadi.",
    remSet:   (m,t) => "*" + m + " daqiqadan* keyin:\n_" + t + "_",
    remFire:  t => "*Eslatma!*\n\n" + t,
    rem60:    (t,tm) => "*1 soat qoldi:* " + t + " — " + tm,
    rem0:     (t,tm) => "*Vaqt keldi!* " + t + " — " + tm,
    remBad:   "1–1440 daqiqa kiriting.",
    cEmpty2:  "*Kontaktlar bo'sh*\n\nQuyidagi tugmani bosing.",
    cList:    "*Barcha kontaktlar:*\n\n",
    cFoot:    "_/delclient N — o'chirish_",
    cAddBtn:  "➕ Kontakt qo'shish",
    cDelOk:   n => "*" + n + "* o'chirildi.",
    cDelNF:   "Kontakt topilmadi.",
    cS1:      "*Yangi kontakt*\n\n1/4-qadam — Ism:",
    cS2:      n => "Ism: *" + n + "*\n\n2/4-qadam — @username (yoki «yo'q»):",
    cS3:      u => "Username: " + (u||"—") + "\n\n3/4-qadam — Telefon (yoki «yo'q»):",
    cS4:      p => "Telefon: " + (p||"—") + "\n\n4/4-qadam — Eslatma (yoki «yo'q»):",
    cSaved:   c => "Kontakt saqlandi!\n\n" + c.name + "\n" + (c.username||"—") + "\n" + (c.phone||"—"),
    cMore:    "➕ Yana kontakt",
    cDone:    "✅ Tayyor",
    no:       ["нет","no","yo'q","yoq"],
    kb: [
      ["🤖 Biznes",   "💡 G'oyalar", "✏️ Matnlar"],
      ["📈 Tahlilchi","⚖️ Qonunlar","🧮 Hisobchi"],
      ["⏰ Vaqt",     "👥 Kontaktlar"],
      ["📋 Vazifalar","🔄 Tozalash","❓ Yordam"],
    ],
    modeMap: {
      "🤖 Biznes":"general","💡 G'oyalar":"brainstorm","✏️ Matnlar":"text",
      "📈 Tahlilchi":"analyst","⚖️ Qonunlar":"law","🧮 Hisobchi":"accountant","⏰ Vaqt":"time",
    },
    btn: { c:"👥 Kontaktlar", t:"📋 Vazifalar", h:"❓ Yordam", r:"🔄 Tozalash" },
    help: "*Imkoniyatlar:*\n\nShaxsiy chat — to'liq funksiya\nGuruh — buyruqlar:\n/menu /analyst /business /ideas\n/law /accountant /time\n@bot savol — AI javobi\n\n*Vazifalar:*\n/add 14:30 Uchrashuv\n/done 1 · /del 2\n\n/linkgroup — guruh ulash\n/lang — til",
  },
};

// ──────────────────────────────────────────────────────────
//  AI СИСТЕМА
// ──────────────────────────────────────────────────────────
const BASE_SYS = {
  general:    { ru: "Опытный бизнес-консультант. Краткие, практичные ответы. На русском.",    uz: "Tajribali biznes maslahatchisi. Qisqa va aniq javoblar. O'zbek tilida." },
  brainstorm: { ru: "Креативный бизнес-стратег. Нумерованные конкретные идеи. На русском.",   uz: "Ijodiy biznes strateg. Raqamlangan g'oyalar. O'zbek tilida." },
  text:       { ru: "Профессиональный копирайтер. Деловые тексты, письма, посты. На русском.", uz: "Professional kopirayter. Ishbilarmonlik matnlari. O'zbek tilida." },
  analyst:    { ru: "Финансовый аналитик. KPI, ROI, EBITDA, рыночный анализ. На русском.",    uz: "Moliyaviy tahlilchi. KPI, ROI, EBITDA. O'zbek tilida." },
  law:        { ru: "Юрист по законодательству Узбекистана. Конституция, Налоговый кодекс (НДС 12%, прибыль 15%, НДФЛ 12%, соц.налог 12%, ИНПС 0.1%, оборот 4%), ТК, ГК. Ссылки на статьи. На русском.", uz: "O'zbekiston huquqshunosi. Konstitutsiya, NK (QQS 12%, foyda 15%, JSHDS 12%, ijt.soliq 12%, INPS 0.1%, aylanma 4%), MK, FK. Moddalar. O'zbek tilida." },
  accountant: { ru: "Бухгалтер РУз. ИНПС=X*0.001, НДФЛ=(X-ИНПС)*0.12, на руки=X-ИНПС-НДФЛ, соц.налог=X*0.12. Показывать формулы. На русском.", uz: "O'zbekiston buxgalteri. INPS=X*0.001, JSHDS=(X-INPS)*0.12, Qo'lga=X-INPS-JSHDS, Ijt=X*0.12. Formulalar. O'zbek tilida." },
  time:       { ru: "Эксперт по тайм-менеджменту. Матрица Эйзенхауэра, Time Blocking, Pomodoro 25+5, Парето 80/20. Расписание по часам. На русском.", uz: "Vaqt menejment eksperti. Eyzenxauer, Time Blocking, Pomodoro. Soatma-soat. O'zbek tilida." },
};

const SUB_SYS = {
  general_strategy:    "Эксперт по стратегии и управлению. Бизнес-планы, KPI, оргструктура. На русском.",
  general_marketing:   "Маркетолог. Стратегия, ЦА, позиционирование, кампании. На русском.",
  general_sales:       "Эксперт по продажам. Скрипты, возражения, переговоры. На русском.",
  general_startup:     "Ментор стартапов. MVP, питч-дек, инвесторы, unit-экономика. На русском.",
  general_hr:          "HR-эксперт. Найм, мотивация, онбординг. На русском.",
  brain_product:       "Продуктовый стратег. Идеи продуктов, Jobs-to-be-done. На русском.",
  brain_marketing:     "Маркетинговый креатор. Нестандартные акции, вирусный контент. На русском.",
  brain_monetize:      "Эксперт по монетизации. Модели дохода, upsell, cross-sell. На русском.",
  brain_content:       "Контент-стратег. Идеи для постов, Reels, TikTok, YouTube. На русском.",
  brain_innovation:    "Инновационный консультант. Автоматизация, AI. На русском.",
  text_email:          "Деловой копирайтер. КП, переписка, follow-up. На русском.",
  text_contract:       "Юридический копирайтер. Договоры, NDA, документы. На русском.",
  text_social:         "SMM-копирайтер. Посты Instagram, Telegram, LinkedIn. На русском.",
  text_ads:            "Рекламный копирайтер. Объявления, лендинги, рассылки. На русском.",
  text_report:         "Аналитик. Отчёты, презентации, executive summary. На русском.",
  analyst_marketplace: "Эксперт маркетплейсов (Uzum, Wildberries, Ozon, Amazon). Ниши, конкуренты, карточки. На русском.",
  analyst_local:       "Аналитик рынка Узбекистана. Спрос, конкуренты, тренды. На русском.",
  analyst_social:      "SMM-аналитик. Вовлечённость, охваты, конкуренты. На русском.",
  analyst_stocks:      "Аналитик фондового рынка. Акции, P/E, EPS, теханализ. На русском.",
  analyst_crypto:      "Крипто-аналитик. DeFi, tokenomics, on-chain, теханализ. На русском.",
  law_tax:             "Налоговый консультант РУз. НДС 12%, прибыль 15%, НДФЛ, соц.налог. На русском.",
  law_labor:           "Трудовое право РУз. Договоры, увольнение, отпуска. На русском.",
  law_business:        "Предпринимательское право РУз. ИП, ООО, лицензии. На русском.",
  law_civil:           "Гражданское право РУз. Договоры, обязательства, собственность. На русском.",
  law_customs:         "Таможня и ВЭД РУз. Импорт/экспорт, пошлины, ТН ВЭД. На русском.",
  acc_salary:          "Бухгалтер по зарплате РУз. ИНПС=X*0.001, НДФЛ=(X-ИНПС)*0.12. Формулы. На русском.",
  acc_tax:             "Налоговый бухгалтер РУз. НДС 12%, прибыль 15%, авансы. На русском.",
  acc_balance:         "Финансовый бухгалтер. Баланс, ликвидность, анализ. На русском.",
  acc_cashflow:        "CFO. Cash Flow, P&L, бюджеты, EBITDA. На русском.",
  acc_calc:            "Калькулятор. Себестоимость, маржа, безубыточность. На русском.",
  time_day:            "Планировщик дня. Почасовое расписание, Time Blocking. На русском.",
  time_week:           "Планировщик недели. Распределение по дням, дедлайны. На русском.",
  time_goals:          "Коуч по целям. SMART, матрица Эйзенхауэра, декомпозиция. На русском.",
  time_pomodoro:       "Pomodoro-тренер. Сессии 25+5 мин. На русском.",
  time_habits:         "Коуч по привычкам. Трекеры, метод 21 дня. На русском.",
};

const SUBDEPTS = {
  general:    [["📊 Стратегия","general_strategy"],["📣 Маркетинг","general_marketing"],["💰 Продажи","general_sales"],["🚀 Стартап","general_startup"],["👥 HR","general_hr"]],
  brainstorm: [["📦 Продукт","brain_product"],["📢 Маркетинг-идеи","brain_marketing"],["💵 Монетизация","brain_monetize"],["🎬 Контент","brain_content"],["⚡ Инновации","brain_innovation"]],
  text:       [["📧 Письма","text_email"],["📃 Договоры","text_contract"],["📱 Соц сети","text_social"],["📣 Реклама","text_ads"],["📊 Отчёты","text_report"]],
  analyst:    [["🛒 Маркетплейсы","analyst_marketplace"],["🏪 Местный рынок","analyst_local"],["📊 Соц сети","analyst_social"],["📉 Акции","analyst_stocks"],["🪙 Крипта","analyst_crypto"]],
  law:        [["🧾 Налоговый кодекс","law_tax"],["👷 Трудовое право","law_labor"],["🏢 Предпринимательство","law_business"],["📜 Гражданское право","law_civil"],["🛃 Таможня и ВЭД","law_customs"]],
  accountant: [["💵 Зарплата","acc_salary"],["🧾 Налоги","acc_tax"],["📊 Баланс","acc_balance"],["💸 Cash Flow","acc_cashflow"],["🔢 Калькулятор","acc_calc"]],
  time:       [["📅 День","time_day"],["🗓 Неделя","time_week"],["🎯 Цели","time_goals"],["🍅 Pomodoro","time_pomodoro"],["✅ Привычки","time_habits"]],
};

const MODE_ICONS = { general:"🤖", brainstorm:"💡", text:"✏️", analyst:"📈", law:"⚖️", accountant:"🧮", time:"⏰" };
const MODE_NAMES = { general:"Бизнес", brainstorm:"Идеи", text:"Тексты", analyst:"Аналитик", law:"Законы", accountant:"Бухгалтер", time:"Тайм" };

const SUB_WELCOME = {
  general_strategy:    "📊 *Стратегия*\n\nПомогу с бизнес-стратегией, KPI, управленческими решениями.",
  general_marketing:   "📣 *Маркетинг*\n\nПомогу со стратегией, анализом аудитории, кампаниями.",
  general_sales:       "💰 *Продажи*\n\nПомогу со скриптами, возражениями, переговорами.",
  general_startup:     "🚀 *Стартап*\n\nПомогу с MVP, питч-деком, инвесторами.",
  general_hr:          "👥 *HR*\n\nПомогу с наймом, мотивацией, онбордингом.",
  brain_product:       "📦 *Продукт*\n\nОпишите нишу или проблему клиента — генерирую идеи!",
  brain_marketing:     "📢 *Маркетинг-идеи*\n\nРасскажите про бизнес — предложу нестандартные идеи!",
  brain_monetize:      "💵 *Монетизация*\n\nЧто есть — предложу источники дохода!",
  brain_content:       "🎬 *Контент*\n\nПлатформа и тема — генерирую идеи постов!",
  brain_innovation:    "⚡ *Инновации*\n\nЧто оптимизируем — предложу AI и автоматизацию!",
  text_email:          "📧 *Письма*\n\nКому и по какому поводу пишем?",
  text_contract:       "📃 *Договоры*\n\nКакой документ между кем?",
  text_social:         "📱 *Посты*\n\nПлатформа и тема поста?",
  text_ads:            "📣 *Реклама*\n\nЧто и для кого рекламируем?",
  text_report:         "📊 *Отчёты*\n\nЧто за отчёт и для кого?",
  analyst_marketplace: "🛒 *Маркетплейсы*\n\nАнализирую Uzum, Wildberries, Ozon — задайте вопрос!",
  analyst_local:       "🏪 *Местный рынок*\n\nОпишите нишу — анализирую!",
  analyst_social:      "📊 *Соц сети*\n\nЧто анализируем — задайте вопрос!",
  analyst_stocks:      "📉 *Акции*\n\nКакие акции или рынки интересуют?",
  analyst_crypto:      "🪙 *Крипта*\n\nКакой актив или тема интересует?",
  law_tax:             "🧾 *Налоги*\n\nОтвечу по НДС, прибыли, НДФЛ — задайте вопрос!",
  law_labor:           "👷 *Трудовое*\n\nОтвечу по ТК РУз — задайте вопрос!",
  law_business:        "🏢 *Предпринимательство*\n\nОтвечу по ИП, ООО, лицензиям!",
  law_civil:           "📜 *Гражданское*\n\nОтвечу по договорам и обязательствам!",
  law_customs:         "🛃 *Таможня*\n\nОтвечу по импорту/экспорту, пошлинам!",
  acc_salary:          "💵 *Зарплата*\n\nНазовите оклад — рассчитаю НДФЛ, ИНПС, на руки.",
  acc_tax:             "🧾 *Налоги*\n\nРассчитаю НДС, прибыль — задайте вопрос!",
  acc_balance:         "📊 *Баланс*\n\nПомогу с балансом и анализом!",
  acc_cashflow:        "💸 *Cash Flow*\n\nПомогу с P&L и движением денег!",
  acc_calc:            "🔢 *Калькулятор*\n\nДайте данные — считаю себестоимость и маржу!",
  time_day:            "📅 *День*\n\nПеречислите задачи — составлю расписание!",
  time_week:           "🗓 *Неделя*\n\nПеречислите задачи — распределю по дням!",
  time_goals:          "🎯 *Цели*\n\nОпишите цели — расставлю приоритеты!",
  time_pomodoro:       "🍅 *Pomodoro*\n\nСколько задач — составлю сессии 25+5!",
  time_habits:         "✅ *Привычки*\n\nКакую привычку вырабатываем?",
};

function getAISystem(u) {
  const lang = u.lang || "ru";
  if (u.submode && SUB_SYS[u.submode]) return SUB_SYS[u.submode];
  const m = BASE_SYS[u.mode || "general"];
  return m ? (m[lang] || m.ru) : BASE_SYS.general.ru;
}

async function callAI(system, messages) {
  const r = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 1500,
    messages: [{ role: "system", content: system }, ...messages],
  });
  return r.choices[0].message.content;
}

async function ai(chatId, msg, ctx) {
  const u = getUser(chatId);
  const h = u.history || [];
  h.push({ role: "user", content: ctx ? ctx + "\n\n" + msg : msg });
  if (h.length > 20) h.splice(0, h.length - 20);
  const reply = await callAI(getAISystem(u), h);
  h.push({ role: "assistant", content: reply });
  u.history = h;
  saveUser(chatId, u);
  return reply;
}

// ──────────────────────────────────────────────────────────
//  ДАШБОРД
// ──────────────────────────────────────────────────────────
function showDashboard(chatId) {
  const t = T(chatId), u = getUser(chatId);
  const now = new Date();
  const d  = pad(now.getDate()) + "." + pad(now.getMonth()+1) + "." + now.getFullYear();
  const tm = pad(now.getHours()) + ":" + pad(now.getMinutes());
  const tasks   = (u.tasks||[]).filter(x=>!x.done).sort((a,b)=>a.time&&b.time?a.time.localeCompare(b.time):a.time?-1:1);
  const clients = u.clients || [];
  let txt = t.dashHead(u.name, d, tm);
  txt += t.tHead(tasks.length);
  if (!tasks.length) txt += t.tEmpty;
  else tasks.forEach((tk,i) => { txt += (i+1) + ". " + (tk.time?"🕐 "+tk.time+" ":"") + tk.text + "\n"; });
  txt += t.tHint;
  txt += t.cHead(clients.length);
  if (!clients.length) txt += t.cEmpty;
  else {
    clients.slice(0,5).forEach(c => { txt += "• " + c.name + (c.username?" "+c.username:"") + (c.phone?" · "+c.phone:"") + "\n"; });
    if (clients.length > 5) txt += t.cMore(clients.length - 5);
  }
  if (u.groupId) { const g = getGroups()[u.groupId]; if (g) txt += "\n" + t.gLine(g.title); }
  txt += "\n" + t.modeLabel;
  bot.sendMessage(chatId, txt, { parse_mode:"Markdown", ...kb(chatId) });
}

function showSubDepts(chatId, modeKey) {
  const lang = getUser(chatId).lang || "ru";
  const subs = SUBDEPTS[modeKey];
  if (!subs) return;
  const icon = MODE_ICONS[modeKey];
  const name = MODE_NAMES[modeKey];
  const rows = [];
  for (let i = 0; i < subs.length; i += 2) {
    const row = [{ text: subs[i][0], callback_data: "sub_" + subs[i][1] }];
    if (subs[i+1]) row.push({ text: subs[i+1][0], callback_data: "sub_" + subs[i+1][1] });
    rows.push(row);
  }
  bot.sendMessage(chatId, icon + " *" + name + "*\n\nВыберите направление:", {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: rows },
  });
}

// ──────────────────────────────────────────────────────────
//  ОНБОРДИНГ
// ──────────────────────────────────────────────────────────
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
  if (msg.chat.type !== "private") return;
  const u = getUser(id);
  if (!u.lang)  return showLangPicker(id);
  if (!u.ready) { waitingName.add(id); return bot.sendMessage(id, T(id).askName, { reply_markup:{ remove_keyboard:true } }); }
  showDashboard(id);
});

bot.onText(/\/lang/, (msg) => {
  if (msg.chat.type === "private") showLangPicker(msg.chat.id);
});

// ──────────────────────────────────────────────────────────
//  КОНТАКТЫ
// ──────────────────────────────────────────────────────────
function showContacts(chatId) {
  const t = T(chatId), u = getUser(chatId), cl = u.clients || [];
  const addKb = { reply_markup:{ inline_keyboard:[[{ text:t.cAddBtn, callback_data:"crm_add" }]] } };
  if (!cl.length) return bot.sendMessage(chatId, t.cEmpty2, { parse_mode:"Markdown", ...addKb });
  let txt = t.cList;
  cl.forEach((c,i) => {
    txt += "*" + (i+1) + ". " + c.name + "*\n";
    if (c.username) txt += "  📱 " + c.username + "\n";
    if (c.phone)    txt += "  📞 " + c.phone + "\n";
    if (c.note)     txt += "  📝 " + c.note + "\n";
    txt += "\n";
  });
  txt += t.cFoot;
  bot.sendMessage(chatId, txt, { parse_mode:"Markdown", ...addKb });
}

function startCRM(chatId) {
  waitingCRM.set(chatId, { step:"name" });
  bot.sendMessage(chatId, T(chatId).cS1, { parse_mode:"Markdown", reply_markup:{ remove_keyboard:true } });
}

async function handleCRM(chatId, text) {
  const s = waitingCRM.get(chatId);
  if (!s) return false;
  const t = T(chatId);
  const no = v => t.no.includes(v.toLowerCase().trim());
  if (s.step === "name")     { s.name=text; s.step="username"; bot.sendMessage(chatId, t.cS2(text), { parse_mode:"Markdown" }); return true; }
  if (s.step === "username") { s.username=no(text)?null:(text.startsWith("@")?text:"@"+text); s.step="phone"; bot.sendMessage(chatId, t.cS3(s.username), { parse_mode:"Markdown" }); return true; }
  if (s.step === "phone")    { s.phone=no(text)?null:text; s.step="note"; bot.sendMessage(chatId, t.cS4(s.phone), { parse_mode:"Markdown" }); return true; }
  if (s.step === "note") {
    s.note = no(text) ? null : text;
    waitingCRM.delete(chatId);
    const u = getUser(chatId); u.clients = u.clients||[]; u.clients.push({ id:Date.now(), name:s.name, username:s.username, phone:s.phone, note:s.note }); saveUser(chatId,u);
    bot.sendMessage(chatId, t.cSaved(s), { parse_mode:"Markdown" });
    bot.sendMessage(chatId, "Добавить ещё?", { reply_markup:{ inline_keyboard:[[{ text:t.cMore, callback_data:"crm_add" },{ text:t.cDone, callback_data:"crm_done" }]] } });
    return true;
  }
  return false;
}

bot.onText(/\/newclient/, (msg) => { if (msg.chat.type==="private") startCRM(msg.chat.id); });
bot.onText(/\/clients/,   (msg) => { if (msg.chat.type==="private") showContacts(msg.chat.id); });
bot.onText(/\/delclient (\d+)/, (msg, m) => {
  if (msg.chat.type !== "private") return;
  const id=msg.chat.id, t=T(id), u=getUser(id), i=+m[1]-1;
  if (!u.clients||i<0||i>=u.clients.length) return bot.sendMessage(id, t.cDelNF, kb(id));
  const name=u.clients.splice(i,1)[0].name; saveUser(id,u);
  bot.sendMessage(id, t.cDelOk(name), { parse_mode:"Markdown", ...kb(id) });
});

// ──────────────────────────────────────────────────────────
//  ЗАДАЧИ
// ──────────────────────────────────────────────────────────
function parseTime(s) {
  const m = s.match(/(\d{1,2})[:.]+(\d{2})/);
  if (!m) return null;
  const h=+m[1], mn=+m[2];
  return (h>23||mn>59) ? null : { h, m:mn };
}

bot.onText(/\/add (.+)/, (msg, m) => {
  const id=msg.chat.id, t=T(id), u=getUser(id); u.tasks=u.tasks||[];
  const raw=m[1].trim(), tm=raw.match(/^(\d{1,2}[:.]\d{2})\s+(.*)/);
  let text, time;
  if (tm) { const p=parseTime(tm[1]); if(p){time=pad(p.h)+":"+pad(p.m);text=tm[2];}else text=raw; } else text=raw;
  u.tasks.push({ id:Date.now(), text, time:time||null, done:false, r60:false, r0:false });
  saveUser(id,u);
  bot.sendMessage(id, t.tOk(u.tasks.length,text,time), { parse_mode:"Markdown", ...kb(id) });
});

bot.onText(/\/done (\d+)/, (msg, m) => {
  const id=msg.chat.id, t=T(id), u=getUser(id), i=+m[1]-1;
  if (!u.tasks||i<0||i>=u.tasks.length) return bot.sendMessage(id, t.tNF, kb(id));
  u.tasks[i].done=true; saveUser(id,u);
  bot.sendMessage(id, t.tDone(u.tasks[i].text), { parse_mode:"Markdown", ...kb(id) });
});

bot.onText(/\/del (\d+)/, (msg, m) => {
  const id=msg.chat.id, t=T(id), u=getUser(id), i=+m[1]-1;
  if (!u.tasks||i<0||i>=u.tasks.length) return bot.sendMessage(id, t.tNF, kb(id));
  const name=u.tasks.splice(i,1)[0].text; saveUser(id,u);
  bot.sendMessage(id, t.tDel(name), { parse_mode:"Markdown", ...kb(id) });
});

bot.onText(/\/remind (\d+) (.+)/, (msg, m) => {
  const id=msg.chat.id, t=T(id), min=+m[1], txt=m[2].trim();
  if (min<1||min>1440) return bot.sendMessage(id, t.remBad, kb(id));
  setTimeout(() => bot.sendMessage(id, t.remFire(txt), { parse_mode:"Markdown", ...kb(id) }), min*60000);
  bot.sendMessage(id, t.remSet(min,txt), { parse_mode:"Markdown", ...kb(id) });
});

function showTasks(chatId) {
  const t=T(chatId), u=getUser(chatId), tasks=u.tasks||[];
  if (!tasks.length) return bot.sendMessage(chatId, "*Задач нет*\n\n/add 14:30 Встреча", { parse_mode:"Markdown", ...kb(chatId) });
  const pen=tasks.filter(x=>!x.done), dn=tasks.filter(x=>x.done);
  let txt="";
  if (pen.length) { txt+="*"+pen.length+":*\n"; tasks.forEach((tk,i)=>{ if(!tk.done) txt+=(i+1)+". "+(tk.time?"🕐 "+tk.time+" ":"")+tk.text+"\n"; }); }
  if (dn.length)  { txt+="\n*"+dn.length+":*\n"; tasks.forEach((tk,i)=>{ if(tk.done) txt+=(i+1)+". ~"+tk.text+"~\n"; }); }
  txt+="\n_/done N · /del N_";
  sendLong(chatId, txt);
}

// Авто-напоминания
setInterval(() => {
  const db=loadDB(), now=new Date(), nowM=now.getHours()*60+now.getMinutes();
  let changed=false;
  Object.entries(db.users).forEach(([id,u]) => {
    if (!u.tasks) return;
    const t=TX[u.lang||"ru"];
    u.tasks.forEach(tk => {
      if (tk.done||!tk.time) return;
      const p=parseTime(tk.time); if(!p) return;
      const diff=(p.h*60+p.m)-nowM;
      if (diff===60&&!tk.r60) { bot.sendMessage(id,t.rem60(tk.text,tk.time),{parse_mode:"Markdown"}); tk.r60=true; changed=true; }
      if (diff===0 &&!tk.r0)  { bot.sendMessage(id,t.rem0(tk.text,tk.time), {parse_mode:"Markdown"}); tk.r0=true;  changed=true; }
    });
    if (changed) db.users[id]=u;
  });
  try { fs.writeFileSync(DB,JSON.stringify(db)); } catch(_) {}
}, 60000);

// ──────────────────────────────────────────────────────────
//  ТЕГИНГ
// ──────────────────────────────────────────────────────────
const pendingReplies = new Map();

bot.on("my_chat_member", (upd) => {
  const c=upd.chat;
  if ((c.type==="group"||c.type==="supergroup")&&["member","administrator"].includes(upd.new_chat_member?.status))
    saveGroup(String(c.id),{ id:c.id, title:c.title });
});

bot.onText(/\/linkgroup/, (msg) => {
  if (msg.chat.type!=="private") return;
  const id=msg.chat.id, t=T(id), gs=Object.values(getGroups());
  if (!gs.length) return bot.sendMessage(id, t.grpNone, { parse_mode:"Markdown", ...kb(id) });
  bot.sendMessage(id, t.grpPick, { reply_markup:{ inline_keyboard:gs.map(g=>[{ text:g.title, callback_data:"grp_"+g.id }]) } });
});

function parseTag(text) {
  const pp = [
    /(?:спроси\s+у|спроси|ask)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:напомни|скажи|remind|тегни|ping)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:so['']ra(?:gin)?)\s+([a-zA-Zа-яёА-ЯЁ]+)(?:\s+dan)?\s+(.+)/i,
  ];
  for (const p of pp) { const m=text.match(p); if(m) return { name:m[1], msg:m[2] }; }
  return null;
}

async function doTag(chatId, req) {
  const t=T(chatId), u=getUser(chatId);
  if (!u.groupId) return bot.sendMessage(chatId, t.noGroup, { parse_mode:"Markdown", ...kb(chatId) });
  const cl=(u.clients||[]).find(c=>c.name.toLowerCase().includes(req.name.toLowerCase()));
  if (!cl)          return bot.sendMessage(chatId, t.tagNF(req.name), { parse_mode:"Markdown", ...kb(chatId) });
  if (!cl.username) return bot.sendMessage(chatId, t.noUser(cl.name),  { parse_mode:"Markdown", ...kb(chatId) });
  try {
    const owner = u.name || "Менеджер";
    // Формат: "Абдулазиз говорит: @shomakhsud, заказал ли ты чехлы?"
    const grpMsg = u.lang==="uz"
      ? owner + " deydi: " + cl.username + ", " + req.msg
      : owner + " говорит: " + cl.username + ", " + req.msg;
    await bot.sendMessage(u.groupId, grpMsg);
    const key = u.groupId + ":" + cl.username.toLowerCase();
    pendingReplies.set(key, { ownerChatId:chatId, clientName:cl.name, lang:u.lang||"ru" });
    setTimeout(() => pendingReplies.delete(key), 24*60*60*1000);
    bot.sendMessage(chatId, t.tagSent(cl.username, req.msg), { parse_mode:"Markdown", ...kb(chatId) });
  } catch (e) { bot.sendMessage(chatId, t.tagErr, kb(chatId)); }
}

// ──────────────────────────────────────────────────────────
//  ГОЛОС
// ──────────────────────────────────────────────────────────
bot.on("voice", async (msg) => {
  if (msg.chat.type !== "private") return;
  const id=msg.chat.id, t=T(id);
  const st = await bot.sendMessage(id, t.voiceWait);
  bot.sendChatAction(id, "typing");
  const fp = path.join("/tmp", "v_" + msg.voice.file_id + ".ogg");
  try {
    // Скачать файл
    const info = await bot.getFile(msg.voice.file_id);
    const url  = "https://api.telegram.org/file/bot" + TOKEN + "/" + info.file_path;
    const dl   = await axios({ url, responseType:"arraybuffer", timeout:20000 });
    fs.writeFileSync(fp, Buffer.from(dl.data));

    // FormData → Groq Whisper напрямую
    const form = new FormData();
    form.append("file", fs.createReadStream(fp), { filename:"voice.ogg", contentType:"audio/ogg" });
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", getUser(id).lang==="uz"?"uz":"ru");
    form.append("response_format", "text");

    const wr = await axios.post("https://api.groq.com/openai/v1/audio/transcriptions", form, {
      headers: { "Authorization":"Bearer " + GROQ_KEY, ...form.getHeaders() },
      timeout: 30000,
    });
    fs.unlink(fp, ()=>{});

    const recognized = (typeof wr.data==="string" ? wr.data : wr.data.text||"").trim();
    if (!recognized) return bot.editMessageText(t.voiceErr, { chat_id:id, message_id:st.message_id });

    await bot.editMessageText(t.voiceSaid(recognized), { chat_id:id, message_id:st.message_id, parse_mode:"Markdown" });

    const tag = parseTag(recognized);
    if (tag) { await bot.deleteMessage(id, st.message_id); return doTag(id, tag); }

    const reply = await ai(id, recognized);
    await bot.deleteMessage(id, st.message_id);
    sendLong(id, "🎤 _" + recognized + "_\n\n" + reply);
  } catch (e) {
    console.error("VOICE:", e.response?.data || e.message);
    try { fs.unlinkSync(fp); } catch(_) {}
    bot.editMessageText(t.voiceErr, { chat_id:id, message_id:st.message_id });
  }
});

// ──────────────────────────────────────────────────────────
//  ФАЙЛЫ
// ──────────────────────────────────────────────────────────
bot.on("document", async (msg) => {
  if (msg.chat.type !== "private") return;
  const id=msg.chat.id, t=T(id), doc=msg.document, name=doc.file_name||"";
  if (![".xlsx",".xls",".csv"].some(e=>name.endsWith(e))) return bot.sendMessage(id, t.fileNo, kb(id));
  const st = await bot.sendMessage(id, t.fileRead(name), { parse_mode:"Markdown" });
  bot.sendChatAction(id, "typing");
  try {
    const info = await bot.getFile(doc.file_id);
    const url  = "https://api.telegram.org/file/bot" + TOKEN + "/" + info.file_path;
    const fp   = path.join("/tmp", "f_" + doc.file_id + path.extname(info.file_path));
    const dl   = await axios({ url, responseType:"arraybuffer", timeout:20000 });
    fs.writeFileSync(fp, Buffer.from(dl.data));
    const wb = XLSX.readFile(fp);
    let data = "";
    wb.SheetNames.forEach(s => { data+="\n=== "+s+" ===\n"; XLSX.utils.sheet_to_json(wb.Sheets[s],{header:1}).slice(0,100).forEach(r=>{ data+=r.join(" | ")+"\n"; }); });
    fs.unlink(fp, ()=>{});
    data = data.slice(0,8000);
    await bot.editMessageText(t.fileAna, { chat_id:id, message_id:st.message_id });
    const u=getUser(id), prev=u.mode; u.mode="analyst"; saveUser(id,u);
    const reply = await ai(id, msg.caption||t.analyzeQ, '"'+name+'":\n```\n'+data+'\n```');
    u.mode=prev; saveUser(id,u);
    await bot.deleteMessage(id, st.message_id);
    sendLong(id, t.fileRes(name)+reply);
  } catch (e) { console.error("FILE:",e.message); bot.editMessageText(t.fileErr,{chat_id:id,message_id:st.message_id}); }
});

// ──────────────────────────────────────────────────────────
//  ГРУППА — команды и ответы ИИ
// ──────────────────────────────────────────────────────────
const groupMode = {}; // groupId → modeKey

const GROUP_CMDS = {
  "/business":"general","/biznes":"general","/бизнес":"general",
  "/ideas":"brainstorm","/goyalar":"brainstorm","/идеи":"brainstorm",
  "/text":"text","/тексты":"text",
  "/analyst":"analyst","/analysis":"analyst","/аналитик":"analyst",
  "/law":"law","/qonun":"law","/законы":"law",
  "/accountant":"accountant","/hisobchi":"accountant","/бухгалтер":"accountant",
  "/time":"time","/vaqt":"time","/тайм":"time",
};

function groupMenuKb() {
  return { reply_markup: { inline_keyboard: [
    [{ text:"🤖 Бизнес",   callback_data:"gm_general"    },{ text:"💡 Идеи",     callback_data:"gm_brainstorm" }],
    [{ text:"✏️ Тексты",   callback_data:"gm_text"       },{ text:"📈 Аналитик", callback_data:"gm_analyst"   }],
    [{ text:"⚖️ Законы",   callback_data:"gm_law"        },{ text:"🧮 Бухгалтер",callback_data:"gm_accountant"}],
    [{ text:"⏰ Тайм",     callback_data:"gm_time"       }],
  ]}};
}

// ──────────────────────────────────────────────────────────
//  CALLBACKS
// ──────────────────────────────────────────────────────────
bot.on("callback_query", async (q) => {
  const id = q.message.chat.id;
  bot.answerCallbackQuery(q.id);
  const d = q.data;

  if (d==="lang_ru"||d==="lang_uz") {
    const lang=d==="lang_ru"?"ru":"uz", u=getUser(id);
    u.lang=lang; saveUser(id,u);
    if (!u.ready) { waitingName.add(id); return bot.sendMessage(id, TX[lang].askName, { reply_markup:{ remove_keyboard:true } }); }
    return bot.sendMessage(id, TX[lang].langOk, { parse_mode:"Markdown", ...kb(id) });
  }
  if (d==="crm_add")  { startCRM(id); return; }
  if (d==="crm_done") { showDashboard(id); return; }

  if (d.startsWith("sub_")) {
    const subId=d.replace("sub_",""), u=getUser(id); u.submode=subId; u.history=[]; saveUser(id,u);
    const w=SUB_WELCOME[subId]||"Раздел выбран. Задайте вопрос!";
    return bot.sendMessage(id, w, { parse_mode:"Markdown", ...kb(id) });
  }
  if (d.startsWith("grp_")) {
    const gid=d.replace("grp_",""), g=getGroups()[gid], u=getUser(id);
    u.groupId=gid; saveUser(id,u);
    return bot.sendMessage(id, T(id).grpOk(g.title), { parse_mode:"Markdown", ...kb(id) });
  }
  // Переключение режима в группе через кнопку
  if (d.startsWith("gm_")) {
    const modeKey=d.replace("gm_",""), chatId=q.message.chat.id;
    groupMode[chatId]=modeKey;
    const icon=MODE_ICONS[modeKey]||"", name=MODE_NAMES[modeKey]||modeKey;
    return bot.sendMessage(chatId, icon+" *Режим "+name+"*\n\nЗадайте вопрос — отвечу!", { parse_mode:"Markdown" });
  }
});

// ──────────────────────────────────────────────────────────
//  ГЛАВНЫЙ ОБРАБОТЧИК
// ──────────────────────────────────────────────────────────
bot.on("message", async (msg) => {
  const id   = msg.chat.id;
  const text = msg.text;
  if (!text) return;

  // ── ГРУППА ──────────────────────────────────────────────
  if (msg.chat.type==="group"||msg.chat.type==="supergroup") {
    const cmd = text.split("@")[0].toLowerCase().trim();

    // /menu /start /help — показать кнопки режимов
    if (["/menu","/start","/help"].includes(cmd)) {
      return bot.sendMessage(id,
        "*Выберите режим или используйте команды:*\n\n" +
        "/analyst · /business · /ideas\n" +
        "/law · /accountant · /time\n\n" +
        "_Затем задайте вопрос — отвечу в группе._\n" +
        "_Для @упоминания: @" + BOT_USERNAME + " вопрос_",
        { parse_mode:"Markdown", ...groupMenuKb() }
      );
    }

    // Команды переключения режима
    if (GROUP_CMDS[cmd]) {
      groupMode[id] = GROUP_CMDS[cmd];
      const mKey = GROUP_CMDS[cmd];
      const messages = {
        general:    "🤖 *Бизнес*\n\nЗадайте бизнес-вопрос!",
        brainstorm: "💡 *Идеи*\n\nОпишите задачу — генерирую идеи!",
        text:       "✏️ *Тексты*\n\nКакой текст нужен?",
        analyst:    "📈 *Аналитик*\n\nЗадайте вопрос по данным или рынку!",
        law:        "⚖️ *Законы*\n\nЗадайте вопрос по законодательству РУз!",
        accountant: "🧮 *Бухгалтер*\n\nЗадайте вопрос — считаю налоги и финансы!",
        time:       "⏰ *Тайм*\n\nПеречислите задачи — составлю расписание!",
      };
      return bot.sendMessage(id, messages[mKey]||"Режим выбран!", { parse_mode:"Markdown" });
    }

    // Ответы на тегинг
    if (msg.from?.username) {
      const key = String(id) + ":@" + msg.from.username.toLowerCase();
      const p   = pendingReplies.get(key);
      if (p) {
        const txt  = text.trim().toLowerCase();
        const isYes = ["да","yes","ha","ok","ок","готово","tayyor","done","сделал","сделала","готов","готова"].some(w=>txt===w||txt.startsWith(w));
        const isNo  = ["нет","no","yo'q","yoq","не готово","ещё нет","не сделал","не сделала"].some(w=>txt===w||txt.startsWith(w));
        if (isYes) {
          pendingReplies.delete(key);
          return bot.sendMessage(p.ownerChatId, "✅ *"+p.clientName+"* ответил: *Да*, готово!", { parse_mode:"Markdown" });
        }
        if (isNo) {
          pendingReplies.delete(key);
          return bot.sendMessage(p.ownerChatId, "❌ *"+p.clientName+"* ответил: *Нет*, ещё не готово.", { parse_mode:"Markdown" });
        }
        // Нестандартный ответ
        return bot.sendMessage(p.ownerChatId, "💬 *"+p.clientName+"* пишет:\n_\""+text+"\"_", { parse_mode:"Markdown" });
      }
    }

    // Ответ на упоминание бота или reply
    const mentioned  = BOT_USERNAME && text.includes("@"+BOT_USERNAME);
    const replyToBot = msg.reply_to_message?.from?.is_bot;
    if (!mentioned && !replyToBot) return;

    const q = text.replace("@"+(BOT_USERNAME||""), "").trim();
    if (!q) return;
    bot.sendChatAction(id, "typing");
    try {
      const mode = groupMode[id] || "general";
      const sys  = BASE_SYS[mode] ? (BASE_SYS[mode].ru) : BASE_SYS.general.ru;
      const reply = await callAI(sys, [{ role:"user", content:q }]);
      bot.sendMessage(id, reply, { parse_mode:"Markdown", reply_to_message_id:msg.message_id });
    } catch (e) {
      console.error("Group AI:", e.message);
    }
    return;
  }

  // ── ЛИЧКА ───────────────────────────────────────────────
  const u = getUser(id);
  if (!u.lang) return showLangPicker(id);
  const t = T(id);

  // Онбординг
  if (waitingName.has(id)) {
    waitingName.delete(id);
    u.name=text.trim(); u.ready=true; saveUser(id,u);
    return bot.sendMessage(id, t.welcome(u.name), { parse_mode:"Markdown", ...kb(id) });
  }

  // CRM
  if (waitingCRM.has(id)) { if (await handleCRM(id, text)) return; }

  // Режимы → подразделы
  const modeKey = t.modeMap[text];
  if (modeKey) {
    u.mode=modeKey; u.submode=null; u.history=[]; saveUser(id,u);
    showSubDepts(id, modeKey);
    return;
  }

  if (text===t.btn.c) return showContacts(id);
  if (text===t.btn.t) return showTasks(id);
  if (text===t.btn.h) return bot.sendMessage(id, t.help, { parse_mode:"Markdown", ...kb(id) });
  if (text===t.btn.r) { u.history=[]; u.submode=null; saveUser(id,u); return bot.sendMessage(id, t.histOk, kb(id)); }
  if (text.startsWith("/")) return;

  // Google Sheets
  if (text.includes("docs.google.com/spreadsheets")) {
    const st=await bot.sendMessage(id, t.shLoad);
    bot.sendChatAction(id, "typing");
    try {
      const m=text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/); if(!m) throw new Error();
      const r=await axios.get("https://docs.google.com/spreadsheets/d/"+m[1]+"/export?format=csv",{responseType:"text",timeout:15000});
      await bot.editMessageText(t.shAna,{chat_id:id,message_id:st.message_id});
      const prev=u.mode; u.mode="analyst"; saveUser(id,u);
      const reply=await ai(id, t.analyzeQ, "```\n"+r.data.slice(0,8000)+"\n```");
      u.mode=prev; saveUser(id,u);
      await bot.deleteMessage(id,st.message_id);
      sendLong(id, t.shRes+reply);
    } catch(_){ bot.editMessageText(t.shErr,{chat_id:id,message_id:st.message_id}); }
    return;
  }

  // Тегинг
  const tag = parseTag(text);
  if (tag) return doTag(id, tag);

  // Обычный вопрос
  bot.sendChatAction(id, "typing");
  try {
    const reply = await ai(id, text);
    sendLong(id, reply);
  } catch (e) {
    console.error("AI:", e.message);
    bot.sendMessage(id, "Ошибка. Попробуйте ещё раз.", kb(id));
  }
});

console.log("Bot started!");
