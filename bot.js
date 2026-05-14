// ═══════════════════════════════════════════════════════════════════════════
//  NEXUS BOT — v5.0
//  3 вкладки: Режимы работы | Контакты | Маркетплейсы
//  + Голос | Файлы | Задачи | Группы | Тегинг | Отзывы Uzum
// ═══════════════════════════════════════════════════════════════════════════

const TelegramBot = require("node-telegram-bot-api");
const Groq        = require("groq-sdk");
const axios       = require("axios");
const FormData    = require("form-data");
const XLSX        = require("xlsx");
const express     = require("express");
const fs          = require("fs");
const path        = require("path");

// ─── ENV ────────────────────────────────────────────────────────────────────
const TOKEN    = process.env.TELEGRAM_TOKEN;
const GROQ_KEY = process.env.GROQ_API_KEY;
const PORT     = process.env.PORT || 3000;
const DB_FILE  = path.join("/tmp", "nexus_db.json");

// Номер аккаунта сотрудника для Uzum (бот отвечает с него)
const EMPLOYEE_PHONE = "338087887";

if (!TOKEN || !GROQ_KEY) { console.error("TELEGRAM_TOKEN or GROQ_API_KEY missing"); process.exit(1); }

const bot  = new TelegramBot(TOKEN, { polling: true });
const groq = new Groq({ apiKey: GROQ_KEY });

// Health-check для Render
const app = express();
app.get("/",    (_q, r) => r.send("Nexus Bot OK"));
app.get("/ping",(_q, r) => r.send("pong"));
app.listen(PORT, () => console.log("HTTP on", PORT));

let BOT_USERNAME = "";
bot.getMe().then(m => { BOT_USERNAME = m.username; console.log("Bot @" + BOT_USERNAME); });

// ─── БД ─────────────────────────────────────────────────────────────────────
function loadDB() {
  try { if (fs.existsSync(DB_FILE)) return JSON.parse(fs.readFileSync(DB_FILE, "utf8")); } catch (_) {}
  return { users: {}, groups: {} };
}
function saveDB(db) { try { fs.writeFileSync(DB_FILE, JSON.stringify(db)); } catch (_) {} }

function getUser(id) {
  const db = loadDB();
  if (!db.users[id]) {
    db.users[id] = {
      lang: null, name: null, mode: "general", submode: null,
      history: [], tasks: [], clients: [], shops: [],
      groupId: null, ready: false,
    };
    saveDB(db);
  }
  return db.users[id];
}
function saveUser(id, u)  { const db = loadDB(); db.users[id] = u; saveDB(db); }
function saveGroup(id, d) { const db = loadDB(); db.groups[id] = d; saveDB(db); }
function getGroups()      { return loadDB().groups || {}; }

// ─── УТИЛИТЫ ─────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, "0"); }
function T(id)  { return TX[getUser(id).lang || "ru"]; }
function mainKb(id) {
  return { reply_markup: { keyboard: T(id).kb, resize_keyboard: true } };
}
async function sendLong(chatId, text, extra) {
  const opts = { parse_mode: "Markdown", ...mainKb(chatId), ...(extra||{}) };
  if (text.length <= 4000) return bot.sendMessage(chatId, text, opts);
  for (let i = 0; i < text.length; i += 4000)
    await bot.sendMessage(chatId, text.slice(i, i + 4000), opts);
}

// ─── ПЕРЕВОДЫ ────────────────────────────────────────────────────────────────
const TX = {
  ru: {
    pickLang:  "🌐 Выберите язык / Tilni tanlang:",
    askName:   "👋 Привет! Я Nexus — ваш бизнес-ассистент.\n\nКак вас зовут?",
    welcome:   n => `Приятно познакомиться, *${n}*! 👋\n\nВыберите раздел:`,
    dashHead:  (n,d,t) => `👋 *${n}*, добрый день!\n📅 ${d}  🕐 ${t}\n${"─".repeat(22)}\n\n`,
    tHead:     c => `📋 *Задачи (${c}):*\n`,
    tEmpty:    "_нет задач_\n",
    tHint:     "_/add 14:30 Задача_\n\n",
    cHead:     c => `👥 *Контакты (${c}):*\n`,
    cEmpty:    "_пусто_\n",
    cMore:     n => `_...ещё ${n}_\n`,
    gLine:     t => `🔗 *Группа:* ${t}\n`,
    sHead:     c => `🛒 *Магазины (${c}):*\n`,
    sEmpty:    "_нет магазинов_\n",
    langOk:    "✅ Язык — Русский",
    histOk:    "История очищена ✅",
    noGroup:   "Группа не привязана. /linkgroup",
    grpNone:   "Бот не в группе. Добавьте бота → /linkgroup",
    grpPick:   "Выберите группу:",
    grpOk:     t => `Группа *${t}* привязана!`,
    tagNF:     n => `Контакт *${n}* не найден`,
    noUser:    n => `У *${n}* нет @username`,
    tagSent:   (u,m) => `✅ Отправлено: *${u}* — ${m}`,
    tagErr:    "Не удалось отправить в группу.",
    voiceWait: "🎤 Распознаю...",
    voiceSaid: t => `🎤 *Вы сказали:*\n_${t}_\n\n⏳ Думаю...`,
    voiceErr:  "Не удалось распознать. Попробуйте ещё раз.",
    fileNo:    "Поддерживаю только .xlsx .xls .csv",
    fileRead:  n => `Читаю *${n}*...`,
    fileAna:   "Анализирую...",
    fileRes:   n => `*${n}*\n\n`,
    fileErr:   "Ошибка чтения файла.",
    shLoad:    "Загружаю таблицу...",
    shAna:     "Анализирую...",
    shRes:     "*Google Таблица*\n\n",
    shErr:     "Не удалось загрузить. Убедитесь что таблица открыта.",
    analyzeQ:  "Проанализируй таблицу: показатели, тренды, аномалии, рекомендации.",
    tOk:       (n,t,tm) => `✅ Задача #${n}: _${t}_` + (tm ? `\n⏰ *${tm}* — напомню за 1 час!` : ""),
    tDone:     t => `🎉 Выполнено: _${t}_`,
    tDel:      t => `🗑 Удалено: _${t}_`,
    tNF:       "Задача не найдена.",
    remSet:    (m,t) => `⏰ Напомню через *${m} мин*:\n_${t}_`,
    remFire:   t => `⏰ *Напоминание!*\n\n${t}`,
    rem60:     (t,tm) => `⏰ *Через 1 час:*\n📌 *${t}* — ${tm}`,
    rem0:      (t,tm) => `🔔 *Пора!* 📌 *${t}* — ${tm}`,
    remBad:    "Укажите 1–1440 минут.",
    // Контакты
    cEmpty2:   "*Контакты пусты*\n\nНажмите кнопку ниже.",
    cList:     "*Все контакты:*\n\n",
    cFoot:     "_/delclient N — удалить_",
    cAddBtn:   "➕ Добавить контакт",
    cDelOk:    n => `Контакт *${n}* удалён.`,
    cDelNF:    "Контакт не найден.",
    cS1:       "*Новый контакт*\nШаг 1/4 — Имя:",
    cS2:       n => `Имя: *${n}*\nШаг 2/4 — @username (или «нет»):`,
    cS3:       u => `Username: ${u||"—"}\nШаг 3/4 — Телефон (или «нет»):`,
    cS4:       p => `Телефон: ${p||"—"}\nШаг 4/4 — Заметка (или «нет»):`,
    cSaved:    c => `✅ Контакт сохранён!\n\n👤 ${c.name}\n📱 ${c.username||"—"}\n📞 ${c.phone||"—"}\n📝 ${c.note||"—"}`,
    cMore:     "➕ Ещё контакт",
    cDone:     "✅ Готово",
    no:        ["нет", "no", "yo'q", "yoq"],
    // Маркетплейсы
    mpMenu:    "*🛒 Маркетплейсы*\n\nУправляйте магазинами и автоответами на отзывы:",
    mpAddS1:   "*➕ Добавить магазин*\n\nШаг 1/2 — Название магазина:",
    mpAddS2:   n => `Название: *${n}*\n\nШаг 2/2 — ID магазина на Uzum\n(найдите в seller.uzum.uz → Профиль):`,
    mpAdded:   (n,id) => `✅ *Магазин добавлен!*\n\n🏪 ${n}\n🆔 ID: \`${id}\`\n\n⚡ *Теперь важный шаг:*\nЗайдите в Uzum Sellers → Настройки → Сотрудники → и добавьте этот номер:\n\n📞 *${EMPLOYEE_PHONE}*\n\nПосле этого нажмите кнопку «Проверить»:`,
    mpCheckBtn:"✅ Сотрудник добавлен — начать работу",
    mpActive:  n => `🟢 *${n}* активирован!\nБот начинает мониторинг отзывов прямо сейчас.`,
    mpNoShops: "*Магазинов нет*\n\nДобавьте первый магазин:",
    mpList:    "*🛒 Мои магазины:*\n\n",
    mpRevOn:   "✅ Отзывы: включены",
    mpRevOff:  "⛔ Отзывы: выключены",
    mpRevToggle: (n, on) => `${on ? "✅" : "⛔"} Отзывы для *${n}*: ${on ? "включены" : "выключены"}`,
    mpDelOk:   n => `🗑 Магазин *${n}* удалён.`,
    mpAddBtn:  "➕ Добавить магазин",
    mpAllBtn:  "📋 Мои магазины",
    help: `*Nexus Bot — возможности:*\n\n*🗂 Режимы работы:*\nРежимы с подразделами → выберите и задайте вопрос\n\n*👥 Контакты:*\n/newclient · /clients · /delclient N\nТегинг: _"спроси у Имя..."_\n\n*🛒 Маркетплейсы:*\nДобавить магазин → добавить сотрудника (338087887) → включить отзывы\n\n*Задачи:*\n/add 14:30 Встреча\n/done 1 · /del 2 · /remind 30 Текст\n\n*Группа:*\n/linkgroup · /menu · /analyst · /business\n\n*Файлы:* xlsx/csv · Google Sheets\n*Голос:* 🎤\n*Язык:* /lang`,
    kb: [
      ["🗂 Режимы работы", "👥 Контакты", "🛒 Маркетплейсы"],
      ["📋 Задачи",        "🔄 Сброс",    "❓ Помощь"],
      ["📖 Инструкция"],
    ],
    btn: { modes:"🗂 Режимы работы", contacts:"👥 Контакты", mp:"🛒 Маркетплейсы", tasks:"📋 Задачи", help:"❓ Помощь", reset:"🔄 Сброс", instr:"📖 Инструкция" },
  },
  uz: {
    pickLang:  "🌐 Выберите язык / Tilni tanlang:",
    askName:   "👋 Salom! Men Nexus — biznes yordamchingizman.\n\nIsmingiz nima?",
    welcome:   n => `Tanishganimdan xursandman, *${n}*! 👋\n\nBo'limni tanlang:`,
    dashHead:  (n,d,t) => `👋 *${n}*, xayrli kun!\n📅 ${d}  🕐 ${t}\n${"─".repeat(22)}\n\n`,
    tHead:     c => `📋 *Vazifalar (${c}):*\n`,
    tEmpty:    "_vazifa yo'q_\n",
    tHint:     "_/add 14:30 Vazifa_\n\n",
    cHead:     c => `👥 *Kontaktlar (${c}):*\n`,
    cEmpty:    "_bo'sh_\n",
    cMore:     n => `_...yana ${n} ta_\n`,
    gLine:     t => `🔗 *Guruh:* ${t}\n`,
    sHead:     c => `🛒 *Do'konlar (${c}):*\n`,
    sEmpty:    "_do'kon yo'q_\n",
    langOk:    "✅ Til — O'zbek",
    histOk:    "Tarix tozalandi ✅",
    noGroup:   "Guruh ulanmagan. /linkgroup",
    grpNone:   "Bot guruhda emas. /linkgroup",
    grpPick:   "Guruhni tanlang:",
    grpOk:     t => `*${t}* guruhi ulandi!`,
    tagNF:     n => `*${n}* topilmadi`,
    noUser:    n => `*${n}* ning @username yo'q`,
    tagSent:   (u,m) => `✅ Yuborildi: *${u}* — ${m}`,
    tagErr:    "Guruhga yubora olmadi.",
    voiceWait: "🎤 Taniyapman...",
    voiceSaid: t => `🎤 *Siz aytdingiz:*\n_${t}_\n\n⏳ O'ylamoqdaman...`,
    voiceErr:  "Ovozni tanib bo'lmadi.",
    fileNo:    "Faqat .xlsx .xls .csv",
    fileRead:  n => `*${n}* o'qimoqdaman...`,
    fileAna:   "Tahlil qilmoqdaman...",
    fileRes:   n => `*${n}*\n\n`,
    fileErr:   "Faylni o'qishda xato.",
    shLoad:    "Yuklamoqdaman...",
    shAna:     "Tahlil...",
    shRes:     "*Google Jadval*\n\n",
    shErr:     "Yuklab bo'lmadi.",
    analyzeQ:  "Jadvalni tahlil qil: ko'rsatkichlar, trendlar, anomaliyalar, tavsiyalar.",
    tOk:       (n,t,tm) => `✅ Vazifa #${n}: _${t}_` + (tm ? `\n⏰ *${tm}* — 1 soat oldin eslataman!` : ""),
    tDone:     t => `🎉 Bajarildi: _${t}_`,
    tDel:      t => `🗑 O'chirildi: _${t}_`,
    tNF:       "Vazifa topilmadi.",
    remSet:    (m,t) => `⏰ *${m} daqiqadan* keyin:\n_${t}_`,
    remFire:   t => `⏰ *Eslatma!*\n\n${t}`,
    rem60:     (t,tm) => `⏰ *1 soat qoldi:*\n📌 *${t}* — ${tm}`,
    rem0:      (t,tm) => `🔔 *Vaqt keldi!* 📌 *${t}* — ${tm}`,
    remBad:    "1–1440 daqiqa kiriting.",
    cEmpty2:   "*Kontaktlar bo'sh*\n\nQuyidagi tugmani bosing.",
    cList:     "*Barcha kontaktlar:*\n\n",
    cFoot:     "_/delclient N — o'chirish_",
    cAddBtn:   "➕ Kontakt qo'shish",
    cDelOk:    n => `*${n}* o'chirildi.`,
    cDelNF:    "Kontakt topilmadi.",
    cS1:       "*Yangi kontakt*\n1/4-qadam — Ism:",
    cS2:       n => `Ism: *${n}*\n2/4-qadam — @username (yoki «yo'q»):`,
    cS3:       u => `Username: ${u||"—"}\n3/4-qadam — Telefon (yoki «yo'q»):`,
    cS4:       p => `Telefon: ${p||"—"}\n4/4-qadam — Eslatma (yoki «yo'q»):`,
    cSaved:    c => `✅ Kontakt saqlandi!\n\n👤 ${c.name}\n📱 ${c.username||"—"}\n📞 ${c.phone||"—"}\n📝 ${c.note||"—"}`,
    cMore:     "➕ Yana kontakt",
    cDone:     "✅ Tayyor",
    no:        ["нет","no","yo'q","yoq"],
    mpMenu:    "*🛒 Marketpleyslar*\n\nDo'konlarni boshqaring va sharhlar avtomatik javobini o'rnating:",
    mpAddS1:   "*➕ Do'kon qo'shish*\n\n1/2-qadam — Do'kon nomi:",
    mpAddS2:   n => `Nom: *${n}*\n\n2/2-qadam — Uzum do'kon ID\n(seller.uzum.uz → Profil):`,
    mpAdded:   (n,id) => `✅ *Do'kon qo'shildi!*\n\n🏪 ${n}\n🆔 ID: \`${id}\`\n\n⚡ *Muhim qadam:*\nUzum Sellers → Sozlamalar → Xodimlar → quyidagi raqamni qo'shing:\n\n📞 *${EMPLOYEE_PHONE}*\n\nQo'shgandan so'ng tugmani bosing:`,
    mpCheckBtn:"✅ Xodim qo'shildi — ishni boshlash",
    mpActive:  n => `🟢 *${n}* faollashtirildi!\nBot hoziroq sharhlarni kuzatishni boshladi.`,
    mpNoShops: "*Do'konlar yo'q*\n\nBirinchi do'konni qo'shing:",
    mpList:    "*🛒 Mening do'konlarim:*\n\n",
    mpRevOn:   "✅ Sharhlar: yoqilgan",
    mpRevOff:  "⛔ Sharhlar: o'chirilgan",
    mpRevToggle: (n, on) => `${on ? "✅" : "⛔"} *${n}* uchun sharhlar: ${on ? "yoqilgan" : "o'chirilgan"}`,
    mpDelOk:   n => `🗑 *${n}* o'chirildi.`,
    mpAddBtn:  "➕ Do'kon qo'shish",
    mpAllBtn:  "📋 Mening do'konlarim",
    help: `*Nexus Bot — imkoniyatlar:*\n\n*🗂 Ish rejimlari:*\nRejimlar va bo'limlar\n\n*👥 Kontaktlar:*\n/newclient · /clients\nTeglash: _"Shomaxsuddan so'ra..."_\n\n*🛒 Marketpleyslar:*\nDo'kon qo'shish → xodim (338087887) → sharhlarni yoqish\n\n*Vazifalar:*\n/add 14:30 Uchrashuv\n/done 1 · /del 2\n\n*Guruh:*\n/linkgroup · /menu · /analyst\n\n*Fayllar:* xlsx/csv · Google Sheets\n*Ovoz:* 🎤\n*Til:* /lang`,
    kb: [
      ["🗂 Ish rejimlari", "👥 Kontaktlar", "🛒 Marketpleyslar"],
      ["📋 Vazifalar",     "🔄 Tozalash",   "❓ Yordam"],
      ["📖 Ko'rsatma"],
    ],
    btn: { modes:"🗂 Ish rejimlari", contacts:"👥 Kontaktlar", mp:"🛒 Marketpleyslar", tasks:"📋 Vazifalar", help:"❓ Yordam", reset:"🔄 Tozalash", instr:"📖 Ko'rsatma" },
  },
};

// ─── AI РЕЖИМЫ ───────────────────────────────────────────────────────────────
const BASE_SYS = {
  general:    { ru:"Опытный бизнес-консультант. На русском.", uz:"Tajribali biznes maslahatchisi. O'zbek tilida." },
  brainstorm: { ru:"Креативный стратег, генератор идей. На русском.", uz:"Ijodiy strateg. O'zbek tilida." },
  text:       { ru:"Профессиональный копирайтер. Деловые тексты. На русском.", uz:"Professional kopirayter. O'zbek tilida." },
  analyst:    { ru:"Финансовый аналитик. KPI, ROI, EBITDA. На русском.", uz:"Moliyaviy tahlilchi. O'zbek tilida." },
  law:        { ru:"Юрист РУз. Конституция, НК (НДС 12%, прибыль 15%, НДФЛ 12%, соц.налог 12%, ИНПС 0.1%, оборот 4%), ТК, ГК. Ссылки на статьи. На русском.", uz:"O'zbekiston huquqshunosi. NK, MK, FK. O'zbek tilida." },
  accountant: { ru:"Бухгалтер РУз. ИНПС=X*0.001, НДФЛ=(X-ИНПС)*0.12, на руки=X-ИНПС-НДФЛ, соц.налог=X*0.12. Формулы. На русском.", uz:"O'zbekiston buxgalteri. Formulalar. O'zbek tilida." },
  time:       { ru:"Эксперт тайм-менеджмент. Матрица Эйзенхауэра, Time Blocking, Pomodoro. На русском.", uz:"Vaqt menejment eksperti. O'zbek tilida." },
};

const SUB_SYS = {
  general_strategy:"Эксперт по стратегии. Бизнес-планы, KPI, управление. На русском.",
  general_marketing:"Маркетолог. Стратегия, ЦА, рекламные кампании. На русском.",
  general_sales:"Эксперт по продажам. Скрипты, возражения, переговоры. На русском.",
  general_startup:"Ментор стартапов. MVP, питч-дек, инвесторы. На русском.",
  general_hr:"HR-эксперт. Найм, мотивация, онбординг. На русском.",
  brain_product:"Продуктовый стратег. Идеи продуктов. На русском.",
  brain_marketing:"Маркетинговый креатор. Нестандартные идеи. На русском.",
  brain_monetize:"Эксперт по монетизации. На русском.",
  brain_content:"Контент-стратег. Посты, Reels, TikTok. На русском.",
  brain_innovation:"Инновационный консультант. На русском.",
  text_email:"Деловой копирайтер. Письма и КП. На русском.",
  text_contract:"Юридический копирайтер. Договоры, NDA. На русском.",
  text_social:"SMM-копирайтер. Посты для соц сетей. На русском.",
  text_ads:"Рекламный копирайтер. На русском.",
  text_report:"Аналитик. Отчёты, презентации. На русском.",
  analyst_marketplace:"Эксперт маркетплейсов (Uzum, Wildberries, Ozon, Amazon). На русском.",
  analyst_local:"Аналитик рынка Узбекистана. На русском.",
  analyst_social:"SMM-аналитик. Вовлечённость, охваты. На русском.",
  analyst_stocks:"Аналитик фондового рынка. На русском.",
  analyst_crypto:"Крипто-аналитик. DeFi, tokenomics. На русском.",
  law_tax:"Налоговый консультант РУз. НДС 12%, прибыль 15%. На русском.",
  law_labor:"Трудовое право РУз. На русском.",
  law_business:"Предпринимательское право РУз. На русском.",
  law_civil:"Гражданское право РУз. На русском.",
  law_customs:"Таможня и ВЭД РУз. На русском.",
  acc_salary:"Зарплатный бухгалтер. ИНПС=X*0.001, НДФЛ=(X-ИНПС)*0.12. На русском.",
  acc_tax:"Налоговый бухгалтер. НДС, прибыль. На русском.",
  acc_balance:"Финансовый бухгалтер. Баланс, ликвидность. На русском.",
  acc_cashflow:"CFO. Cash Flow, P&L, EBITDA. На русском.",
  acc_calc:"Калькулятор. Себестоимость, маржа, безубыточность. На русском.",
  time_day:"Планировщик дня. Почасовое расписание. На русском.",
  time_week:"Планировщик недели. На русском.",
  time_goals:"Коуч по целям. SMART, декомпозиция. На русском.",
  time_pomodoro:"Pomodoro-тренер. Сессии 25+5. На русском.",
  time_habits:"Коуч по привычкам. На русском.",
};

const SUBDEPTS = {
  general:    [["📊 Стратегия","general_strategy"],["📣 Маркетинг","general_marketing"],["💰 Продажи","general_sales"],["🚀 Стартап","general_startup"],["👥 HR","general_hr"]],
  brainstorm: [["📦 Продукт","brain_product"],["📢 Маркетинг-идеи","brain_marketing"],["💵 Монетизация","brain_monetize"],["🎬 Контент","brain_content"],["⚡ Инновации","brain_innovation"]],
  text:       [["📧 Письма","text_email"],["📃 Договоры","text_contract"],["📱 Соц сети","text_social"],["📣 Реклама","text_ads"],["📊 Отчёты","text_report"]],
  analyst:    [["🛒 Маркетплейсы","analyst_marketplace"],["🏪 Местный рынок","analyst_local"],["📊 Соц сети","analyst_social"],["📉 Акции","analyst_stocks"],["🪙 Крипта","analyst_crypto"]],
  law:        [["🧾 Налоги","law_tax"],["👷 Трудовое","law_labor"],["🏢 Предпринимательство","law_business"],["📜 Гражданское","law_civil"],["🛃 Таможня","law_customs"]],
  accountant: [["💵 Зарплата","acc_salary"],["🧾 Налоги","acc_tax"],["📊 Баланс","acc_balance"],["💸 Cash Flow","acc_cashflow"],["🔢 Калькулятор","acc_calc"]],
  time:       [["📅 День","time_day"],["🗓 Неделя","time_week"],["🎯 Цели","time_goals"],["🍅 Pomodoro","time_pomodoro"],["✅ Привычки","time_habits"]],
};

const SUB_WELCOME = {
  general_strategy:"📊 *Стратегия*\n\nПомогу с бизнес-стратегией и управлением. Задайте вопрос!",
  general_marketing:"📣 *Маркетинг*\n\nПомогу с анализом аудитории и кампаниями. Задайте вопрос!",
  general_sales:"💰 *Продажи*\n\nПомогу со скриптами и переговорами. Задайте вопрос!",
  general_startup:"🚀 *Стартап*\n\nПомогу с MVP, питч-деком, инвесторами. Задайте вопрос!",
  general_hr:"👥 *HR*\n\nПомогу с наймом и мотивацией. Задайте вопрос!",
  brain_product:"📦 *Продукт*\n\nОпишите нишу — генерирую идеи!",
  brain_marketing:"📢 *Маркетинг-идеи*\n\nРасскажите про бизнес — предложу идеи!",
  brain_monetize:"💵 *Монетизация*\n\nЧто есть — предложу источники дохода!",
  brain_content:"🎬 *Контент*\n\nПлатформа и тема?",
  brain_innovation:"⚡ *Инновации*\n\nЧто оптимизируем?",
  text_email:"📧 *Письма*\n\nКому и по какому поводу?",
  text_contract:"📃 *Договоры*\n\nКакой документ?",
  text_social:"📱 *Посты*\n\nПлатформа и тема?",
  text_ads:"📣 *Реклама*\n\nЧто рекламируем?",
  text_report:"📊 *Отчёты*\n\nЧто за отчёт?",
  analyst_marketplace:"🛒 *Маркетплейсы*\n\nАнализирую Uzum, Wildberries, Ozon. Задайте вопрос!",
  analyst_local:"🏪 *Местный рынок*\n\nОпишите нишу!",
  analyst_social:"📊 *Соц сети*\n\nЧто анализируем?",
  analyst_stocks:"📉 *Акции*\n\nКакие акции интересуют?",
  analyst_crypto:"🪙 *Крипта*\n\nКакой актив?",
  law_tax:"🧾 *Налоги*\n\nОтвечу по НДС, прибыли, НДФЛ!",
  law_labor:"👷 *Трудовое*\n\nОтвечу по ТК РУз!",
  law_business:"🏢 *Предпринимательство*\n\nОтвечу по ИП, ООО!",
  law_civil:"📜 *Гражданское*\n\nОтвечу по договорам!",
  law_customs:"🛃 *Таможня*\n\nОтвечу по импорту/экспорту!",
  acc_salary:"💵 *Зарплата*\n\nНазовите оклад — рассчитаю!",
  acc_tax:"🧾 *Налоги*\n\nРассчитаю НДС, прибыль!",
  acc_balance:"📊 *Баланс*\n\nПомогу с анализом!",
  acc_cashflow:"💸 *Cash Flow*\n\nПомогу с P&L!",
  acc_calc:"🔢 *Калькулятор*\n\nДайте данные — считаю!",
  time_day:"📅 *День*\n\nПеречислите задачи — составлю расписание!",
  time_week:"🗓 *Неделя*\n\nПеречислите задачи — распределю!",
  time_goals:"🎯 *Цели*\n\nОпишите — расставлю приоритеты!",
  time_pomodoro:"🍅 *Pomodoro*\n\nСколько задач — составлю сессии!",
  time_habits:"✅ *Привычки*\n\nКакую привычку вырабатываем?",
};


// ─── МАРКЕТПЛЕЙС — РАЗДЕЛЫ И ПОДРАЗДЕЛЫ ────────────────────────────────────
const MP_SECTIONS = [
  { id:"mp_delegate",  icon:"📋", name:"Делегирование задач",    subs:[
    { id:"mp_d_assign",  label:"👤 Назначить задачу сотруднику" },
    { id:"mp_d_deadline",label:"⏰ Дедлайн и приоритет"         },
    { id:"mp_d_status",  label:"✅ Статус задач"                 },
    { id:"mp_d_overdue", label:"🔔 Напомнить о просрочке"        },
  ]},
  { id:"mp_reviews",   icon:"⭐", name:"Ответы на отзывы (AI)",   subs:[
    { id:"mp_r_template",label:"✍️ Написать шаблон ответа"       },
    { id:"mp_r_approve", label:"✅ Одобрить / отредактировать"    },
    { id:"mp_r_positive",label:"😊 Позитивные отзывы"            },
    { id:"mp_r_negative",label:"😞 Негативные отзывы"            },
    { id:"mp_r_auto",    label:"🤖 Автоответчик ВКЛ / ВЫКЛ"      },
  ]},
  { id:"mp_analytics", icon:"📈", name:"Аналитика продаж",        subs:[
    { id:"mp_a_upload",  label:"📁 Загрузить отчёт из Uzum"      },
    { id:"mp_a_products",label:"📦 Анализ по товарам и дням"      },
    { id:"mp_a_top",     label:"🏆 Топ-товары и слабые позиции"  },
    { id:"mp_a_forecast",label:"🔮 Прогноз на след. период"       },
  ]},
  { id:"mp_content",   icon:"📝", name:"Контент-план",            subs:[
    { id:"mp_c_social",  label:"📱 Постинг в соц сети"           },
    { id:"mp_c_cards",   label:"🏷 Описания карточек товаров"     },
    { id:"mp_c_seo",     label:"🔍 SEO-заголовки для Uzum"        },
    { id:"mp_c_ads",     label:"📣 Рекламные тексты"              },
  ]},
  { id:"mp_team",      icon:"👥", name:"Команда",                 subs:[
    { id:"mp_t_roles",   label:"🎭 Роли: менеджер / оператор"    },
    { id:"mp_t_daily",   label:"📊 Ежедневные отчёты"             },
    { id:"mp_t_tag",     label:"🔔 Тегинг по задачам в группе"   },
    { id:"mp_t_weekly",  label:"📋 Еженедельная сводка"           },
  ]},
  { id:"mp_products",  icon:"📦", name:"Управление товарами",     subs:[
    { id:"mp_p_prices",  label:"💰 Трекер цен конкурентов"        },
    { id:"mp_p_stock",   label:"⚠️ Напомнить о low stock"         },
    { id:"mp_p_unit",    label:"🔢 Расчёт юнит-экономики"         },
    { id:"mp_p_margin",  label:"📊 Оценка маржинальности"         },
  ]},
];

const MP_SUB_PROMPTS = {
  // Делегирование
  mp_d_assign:   "Ты менеджер маркетплейса. Помоги назначить задачу сотруднику: опиши задачу чётко, укажи ответственного, сроки и критерии выполнения. Отвечай на русском.",
  mp_d_deadline: "Ты менеджер проектов на маркетплейсе. Помоги расставить дедлайны и приоритеты для задач по матрице Эйзенхауэра. Отвечай на русском.",
  mp_d_status:   "Ты операционный менеджер маркетплейса. Помоги отслеживать статусы задач: в работе, на проверке, готово. Составь чёткий отчёт о статусах. Отвечай на русском.",
  mp_d_overdue:  "Ты менеджер маркетплейса. Помоги сформулировать напоминания о просроченных задачах — вежливо, но настойчиво. Предложи новые дедлайны. Отвечай на русском.",
  // Отзывы
  mp_r_template: "Ты менеджер магазина на Uzum Market. Напиши профессиональный шаблон ответа на отзыв. Тон: дружелюбный, благодарный. 2-3 предложения. Без 'Дорогой покупатель'. На русском.",
  mp_r_approve:  "Ты редактор ответов на отзывы Uzum. Улучши и отредактируй предложенный ответ — сделай его более живым, профессиональным и персонализированным. На русском.",
  mp_r_positive: "Ты менеджер Uzum Market. Пиши ответы на позитивные отзывы (4-5 звёзд). Тон: тёплый, благодарный, мотивирующий покупать снова. 2-3 предложения. На русском.",
  mp_r_negative: "Ты менеджер Uzum Market. Пиши ответы на негативные отзывы (1-3 звезды). Тон: вежливый, извиняющийся, с конкретным решением проблемы. Не оправдывайся. 3-4 предложения. На русском.",
  // Аналитика
  mp_a_upload:   "Ты аналитик маркетплейса. Пользователь загрузит отчёт из Uzum Market. Когда получишь данные — проанализируй ключевые показатели: выручка, заказы, возвраты, конверсия. На русском.",
  mp_a_products: "Ты аналитик продаж на маркетплейсе. Анализируй показатели по товарам и дням: тренды, сезонность, дни с пиковыми продажами, просадки. Давай конкретные выводы. На русском.",
  mp_a_top:      "Ты аналитик маркетплейса. Определи топ-товары (по выручке, количеству, конверсии) и слабые позиции (низкий оборот, высокие возвраты). Дай рекомендации по каждой группе. На русском.",
  mp_a_forecast: "Ты финансовый аналитик маркетплейса. На основе данных составь прогноз продаж на следующий период: учти сезонность, тренды, акции. Дай 3 сценария: оптимистичный, базовый, пессимистичный. На русском.",
  // Контент
  mp_c_social:   "Ты SMM-менеджер маркетплейса на Uzum. Составь контент-план для Instagram, Telegram и TikTok: темы постов, форматы, частота публикаций. Учти специфику товаров. На русском.",
  mp_c_cards:    "Ты копирайтер для маркетплейса Uzum Market. Пиши продающие описания карточек товаров: цепляющий заголовок, ключевые преимущества, характеристики, призыв к действию. На русском.",
  mp_c_seo:      "Ты SEO-специалист маркетплейса. Составь SEO-оптимизированные заголовки для товаров на Uzum Market: включи ключевые слова, характеристики, бренд. Максимум 100 символов. На русском.",
  mp_c_ads:      "Ты рекламный копирайтер для Uzum Market. Пиши продающие рекламные тексты для промо-акций, баннеров, рассылок. Цепляющий заголовок + выгода + призыв. На русском.",
  // Команда
  mp_t_roles:    "Ты HR-менеджер маркетплейса. Помоги разграничить роли менеджера и оператора: опиши зоны ответственности, KPI, полномочия для каждой роли. На русском.",
  mp_t_daily:    "Ты операционный менеджер маркетплейса. Составь шаблон ежедневного отчёта для команды: продажи, заказы, остатки, задачи, проблемы. Структурированно. На русском.",
  mp_t_tag:      "Ты менеджер маркетплейса. Помоги сформулировать задачу для отправки сотруднику через групповой чат с тегингом. Чётко, конкретно, с дедлайном. На русском.",
  mp_t_weekly:   "Ты аналитик маркетплейса. Составь шаблон еженедельной сводки для команды: итоги недели, KPI, выполненные задачи, план на следующую неделю. На русском.",
  // Товары
  mp_p_prices:   "Ты аналитик конкурентной среды на маркетплейсе. Помоги отслеживать цены конкурентов: как мониторить, на что обращать внимание, когда снижать/повышать цену. На русском.",
  mp_p_stock:    "Ты менеджер по запасам маркетплейса. Помоги настроить систему оповещений о низких остатках (low stock): пороги, формулы расчёта страхового запаса, сроки заказа. На русском.",
  mp_p_unit:     "Ты финансовый аналитик маркетплейса. Рассчитай юнит-экономику товара: себестоимость, комиссия Uzum, логистика, реклама, чистая прибыль с единицы. Покажи формулы. На русском.",
  mp_p_margin:   "Ты финансовый аналитик маркетплейса. Оцени маржинальность товаров: валовая маржа, EBITDA маржа, точка безубыточности. Дай рекомендации по улучшению. На русском.",
};

const MP_SUB_WELCOME = {
  mp_d_assign:   "👤 *Назначить задачу сотруднику*\n\nОпишите задачу — помогу сформулировать поручение с дедлайном и критериями выполнения.",
  mp_d_deadline: "⏰ *Дедлайн и приоритет*\n\nПеречислите задачи — расставлю приоритеты и дедлайны.",
  mp_d_status:   "✅ *Статус задач*\n\nОпишите ваши задачи — составлю отчёт о статусах.",
  mp_d_overdue:  "🔔 *Просроченные задачи*\n\nКакие задачи просрочены? Помогу сформулировать напоминания.",
  mp_r_template: "✍️ *Шаблон ответа на отзыв*\n\nВставьте текст отзыва и рейтинг (⭐) — напишу профессиональный ответ.",
  mp_r_approve:  "✅ *Редактировать ответ*\n\nВставьте черновик ответа — улучшу и сделаю более живым.",
  mp_r_positive: "😊 *Позитивный отзыв*\n\nВставьте текст отзыва (4-5★) — напишу тёплый ответ.",
  mp_r_negative: "😞 *Негативный отзыв*\n\nВставьте текст отзыва (1-3★) — напишу вежливый ответ с решением.",
  mp_a_upload:   "📁 *Анализ отчёта Uzum*\n\nЗагрузите файл отчёта (.xlsx/.csv) или вставьте данные — проанализирую.",
  mp_a_products: "📦 *Анализ по товарам*\n\nОпишите данные или загрузите файл — анализирую по товарам и дням.",
  mp_a_top:      "🏆 *Топ-товары*\n\nОпишите ваш ассортимент или загрузите данные — определю лидеров и аутсайдеров.",
  mp_a_forecast: "🔮 *Прогноз продаж*\n\nДайте данные за прошлый период — составлю прогноз на следующий.",
  mp_c_social:   "📱 *Контент-план для соц сетей*\n\nОпишите ваши товары и аудиторию — составлю контент-план.",
  mp_c_cards:    "🏷 *Описание карточки товара*\n\nНазовите товар и его характеристики — напишу продающее описание.",
  mp_c_seo:      "🔍 *SEO-заголовки для Uzum*\n\nНазовите товар — составлю оптимизированный заголовок.",
  mp_c_ads:      "📣 *Рекламный текст*\n\nОпишите товар и акцию — напишу рекламный текст.",
  mp_t_roles:    "🎭 *Роли в команде*\n\nОпишите вашу команду — помогу разграничить роли и KPI.",
  mp_t_daily:    "📊 *Ежедневный отчёт*\n\nОпишите вашу структуру — составлю шаблон ежедневного отчёта.",
  mp_t_tag:      "🔔 *Задача через группу*\n\nОпишите задачу и кому — сформулирую поручение для отправки.",
  mp_t_weekly:   "📋 *Еженедельная сводка*\n\nДайте данные за неделю — составлю сводку для команды.",
  mp_p_prices:   "💰 *Цены конкурентов*\n\nОпишите ваш товар и конкурентов — помогу с мониторингом цен.",
  mp_p_stock:    "⚠️ *Low stock*\n\nОпишите ваши товары — настрою систему оповещений об остатках.",
  mp_p_unit:     "🔢 *Юнит-экономика*\n\nДайте данные по товару (себестоимость, цена, комиссия) — рассчитаю прибыльность.",
  mp_p_margin:   "📊 *Маржинальность*\n\nДайте данные по выручке и затратам — рассчитаю маржу и дам рекомендации.",
};

const MODE_ICONS = { general:"🤖", brainstorm:"💡", text:"✏️", analyst:"📈", law:"⚖️", accountant:"🧮", time:"⏰" };
const MODE_NAMES = {
  ru: { general:"Бизнес", brainstorm:"Идеи", text:"Тексты", analyst:"Аналитик", law:"Законы", accountant:"Бухгалтер", time:"Тайм" },
  uz: { general:"Biznes", brainstorm:"G'oyalar", text:"Matnlar", analyst:"Tahlilchi", law:"Qonunlar", accountant:"Hisobchi", time:"Vaqt" },
};

function getAISystem(u) {
  const lang = u.lang || "ru";
  // Маркетплейс-режим
  if (u.mode === "mp_custom" && u.submode && MP_SUB_PROMPTS[u.submode]) {
    return MP_SUB_PROMPTS[u.submode];
  }
  if (u.submode && SUB_SYS[u.submode]) return SUB_SYS[u.submode];
  const m = BASE_SYS[u.mode || "general"];
  return m ? (m[lang] || m.ru) : BASE_SYS.general.ru;
}

async function callAI(system, messages) {
  const r = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile", max_tokens: 1500,
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
  u.history = h; saveUser(chatId, u);
  return reply;
}

// ─── ДАШБОРД ─────────────────────────────────────────────────────────────────
function showDashboard(chatId) {
  const t = T(chatId), u = getUser(chatId);
  const now = new Date();
  const d   = pad(now.getDate()) + "." + pad(now.getMonth()+1) + "." + now.getFullYear();
  const tm  = pad(now.getHours()) + ":" + pad(now.getMinutes());
  const tasks   = (u.tasks   || []).filter(x=>!x.done).sort((a,b)=>a.time&&b.time?a.time.localeCompare(b.time):a.time?-1:1);
  const clients = u.clients  || [];
  const shops   = u.shops    || [];
  let txt = t.dashHead(u.name, d, tm);
  txt += t.tHead(tasks.length);
  if (!tasks.length) txt += t.tEmpty;
  else tasks.forEach((tk,i) => { txt += (i+1) + ". " + (tk.time ? "🕐 "+tk.time+" " : "") + tk.text + "\n"; });
  txt += t.tHint;
  txt += t.cHead(clients.length);
  if (!clients.length) txt += t.cEmpty;
  else { clients.slice(0,3).forEach(c => { txt += "• " + c.name + (c.username?" "+c.username:"") + "\n"; }); if (clients.length>3) txt += t.cMore(clients.length-3); }
  txt += t.sHead(shops.length);
  if (!shops.length) txt += t.sEmpty;
  else shops.forEach(s => { txt += "• " + s.name + " " + (s.reviewsEnabled ? "✅" : "⛔") + "\n"; });
  if (u.groupId) { const g = getGroups()[u.groupId]; if (g) txt += "\n" + t.gLine(g.title); }
  bot.sendMessage(chatId, txt, { parse_mode:"Markdown", ...mainKb(chatId) });
}

// ─── ОНБОРДИНГ ───────────────────────────────────────────────────────────────
const waitingName = new Set();
const waitingCRM  = new Map();
const waitingShop = new Map(); // chatId → { step, name }

function showLangPicker(chatId) {
  bot.sendMessage(chatId, TX.ru.pickLang, {
    reply_markup: { inline_keyboard: [
      [{ text:"🇷🇺 Русский",      callback_data:"lang_ru" }],
      [{ text:"🇺🇿 O'zbek tili",  callback_data:"lang_uz" }],
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

bot.onText(/\/lang/, (msg) => { if (msg.chat.type==="private") showLangPicker(msg.chat.id); });

// ─── РЕЖИМЫ РАБОТЫ (инлайн меню) ────────────────────────────────────────────
function showModesMenu(chatId) {
  const uz = (getUser(chatId).lang || "ru") === "uz";
  const title = uz ? "*🗂 Ish rejimlari*\n\nRejimni tanlang:" : "*🗂 Режимы работы*\n\nВыберите режим:";
  const rows = uz ? [
    [{ text:"🤖 Biznes",    callback_data:"mode_general"    }, { text:"💡 G'oyalar",  callback_data:"mode_brainstorm" }],
    [{ text:"✏️ Matnlar",   callback_data:"mode_text"       }, { text:"📈 Tahlilchi", callback_data:"mode_analyst"   }],
    [{ text:"⚖️ Qonunlar",  callback_data:"mode_law"        }, { text:"🧮 Hisobchi",  callback_data:"mode_accountant"}],
    [{ text:"⏰ Vaqt",      callback_data:"mode_time"       }],
  ] : [
    [{ text:"🤖 Бизнес",   callback_data:"mode_general"    }, { text:"💡 Идеи",      callback_data:"mode_brainstorm" }],
    [{ text:"✏️ Тексты",   callback_data:"mode_text"       }, { text:"📈 Аналитик",  callback_data:"mode_analyst"   }],
    [{ text:"⚖️ Законы",   callback_data:"mode_law"        }, { text:"🧮 Бухгалтер", callback_data:"mode_accountant"}],
    [{ text:"⏰ Тайм",     callback_data:"mode_time"       }],
  ];
  bot.sendMessage(chatId, title, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: rows },
  });
}

function showSubDepts(chatId, modeKey) {
  const subs = SUBDEPTS[modeKey];
  if (!subs) return;
  const lang = getUser(chatId).lang || "ru";
  const icon = MODE_ICONS[modeKey], name = (MODE_NAMES[lang]||MODE_NAMES.ru)[modeKey];
  const rows = [];
  for (let i = 0; i < subs.length; i += 2) {
    const row = [{ text:subs[i][0], callback_data:"sub_"+subs[i][1] }];
    if (subs[i+1]) row.push({ text:subs[i+1][0], callback_data:"sub_"+subs[i+1][1] });
    rows.push(row);
  }
  const label = (getUser(chatId).lang||"ru")==="uz" ? "Yo'nalishni tanlang:" : "Выберите направление:";
  bot.sendMessage(chatId, icon + " *" + name + "*\n\n" + label, {
    parse_mode:"Markdown",
    reply_markup: { inline_keyboard: rows },
  });
}

// ─── МАРКЕТПЛЕЙСЫ ────────────────────────────────────────────────────────────
function showMarketplaces(chatId) {
  const t = T(chatId);
  // 6 больших разделов + управление магазинами
  const sectionBtns = MP_SECTIONS.map(s => [{ text: s.icon + " " + s.name, callback_data: "mps_" + s.id }]);
  sectionBtns.push([
    { text: t.mpAddBtn, callback_data: "mp_add" },
    { text: t.mpAllBtn, callback_data: "mp_list" },
  ]);
  bot.sendMessage(chatId, t.mpMenu, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: sectionBtns },
  });
}

function showMPSection(chatId, sectionId) {
  const section = MP_SECTIONS.find(s => s.id === sectionId);
  if (!section) return;
  const subBtns = section.subs.map(sub => [{ text: sub.label, callback_data: "mpx_" + sub.id }]);
  subBtns.push([{ text: "◀️ Назад", callback_data: "mp_back" }]);
  bot.sendMessage(chatId,
    section.icon + " *" + section.name + "*\n\nВыберите раздел:",
    { parse_mode: "Markdown", reply_markup: { inline_keyboard: subBtns } }
  );
}

function showShopList(chatId) {
  const t = T(chatId), u = getUser(chatId);
  const shops = u.shops || [];
  if (!shops.length) {
    return bot.sendMessage(chatId, t.mpNoShops, {
      parse_mode:"Markdown",
      reply_markup: { inline_keyboard: [[{ text:t.mpAddBtn, callback_data:"mp_add" }]] },
    });
  }
  let txt = t.mpList;
  shops.forEach((s, i) => {
    txt += `*${i+1}. ${s.name}*\n`;
    txt += `🆔 ID: \`${s.shopId}\`\n`;
    txt += `${s.active ? "🟢 Активен" : "🔴 Не активирован"}\n\n`;
  });
  // Кнопки для каждого магазина
  const btns = [];
  shops.forEach((s, i) => {
    btns.push([
      { text: s.reviewsEnabled ? "✅ Отзывы вкл" : "⛔ Отзывы выкл", callback_data: "mp_rev_" + i },
      { text: "🗑 Удалить", callback_data: "mp_del_" + i },
    ]);
  });
  btns.push([{ text: t.mpAddBtn, callback_data: "mp_add" }]);
  bot.sendMessage(chatId, txt, {
    parse_mode:"Markdown",
    reply_markup: { inline_keyboard: btns },
  });
}

async function handleShopAdd(chatId, text) {
  const s = waitingShop.get(chatId);
  if (!s) return false;

  // Шаг 2: получили ID магазина — проверяем через Uzum API
  if (s.step === "id") {
    const shopId = text.trim().replace(/[^0-9]/g, "");
    if (!shopId) {
      bot.sendMessage(chatId, "❌ ID должен состоять из цифр. Попробуйте ещё раз:");
      return true;
    }
    const statusMsg = await bot.sendMessage(chatId, "🔍 Проверяю магазин на Uzum...");
    try {
      // Пробуем получить информацию о магазине через Uzum API
      let shopName = null;
      const endpoints = [
        `https://api.uzum.uz/api/shop/${shopId}`,
        `https://api.uzum.uz/api/v1/shop/${shopId}`,
        `https://api.uzum.uz/api/main/shop/${shopId}`,
      ];
      for (const url of endpoints) {
        try {
          const resp = await axios.get(url, {
            timeout: 8000,
            headers: {
              "Accept": "application/json",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            },
          });
          const d = resp.data;
          shopName = d?.payload?.title || d?.payload?.name ||
                     d?.title || d?.name || d?.shopName ||
                     d?.data?.title || d?.data?.name || null;
          if (shopName) break;
        } catch (_) { continue; }
      }

      await bot.deleteMessage(chatId, statusMsg.message_id);

      if (!shopName) {
        // API не ответил — даём ввести название вручную
        s.shopId = shopId;
        s.step = "manual_name";
        waitingShop.set(chatId, s);
        bot.sendMessage(chatId,
          `⚠️ Не удалось получить название автоматически.

Введите название магазина вручную:`,
          { reply_markup: { remove_keyboard: true } }
        );
        return true;
      }

      // Нашли — показываем кнопку подтверждения
      s.shopId   = shopId;
      s.shopName = shopName;
      waitingShop.set(chatId, s);

      bot.sendMessage(chatId,
        `✅ *Магазин найден!*

Нажмите кнопку чтобы добавить:`,
        {
          parse_mode: "Markdown",
          reply_markup: { inline_keyboard: [[
            { text: `🏪 ${shopName} (ID: ${shopId})`, callback_data: "mp_confirm_shop" }
          ]]},
        }
      );
    } catch (e) {
      await bot.deleteMessage(chatId, statusMsg.message_id);
      s.shopId = shopId;
      s.step = "manual_name";
      waitingShop.set(chatId, s);
      bot.sendMessage(chatId,
        `⚠️ Не удалось проверить автоматически.

Введите название вашего магазина:`,
        { reply_markup: { remove_keyboard: true } }
      );
    }
    return true;
  }

  // Шаг manual_name — ручной ввод названия
  if (s.step === "manual_name") {
    s.shopName = text.trim();
    waitingShop.set(chatId, s);
    bot.sendMessage(chatId,
      `✅ *Магазин найден!*

Нажмите кнопку чтобы добавить:`,
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[
          { text: `🏪 ${s.shopName} (ID: ${s.shopId})`, callback_data: "mp_confirm_shop" }
        ]]},
      }
    );
    return true;
  }
  return false;
}

// ─── Отзывы через AI (без Puppeteer — через Groq API) ────────────────────────
// Пользователь пересылает отзыв боту в режиме отзывов
// Бот генерирует ответ и отправляет обратно

async function generateReviewReply(reviewText, rating, lang) {
  const isRu = lang !== "uz";
  const tone = rating >= 4
    ? (isRu ? "дружелюбный и благодарный" : "do'stona va minnatdor")
    : (isRu ? "вежливый, конструктивный, с решением проблемы" : "muloyim, konstruktiv, muammoni hal qiluvchi");
  const sys = isRu
    ? `Менеджер магазина на Uzum Market. Пишешь ответ на отзыв. Тон: ${tone}. 2-3 предложения. Без "Дорогой покупатель". На русском.`
    : `Uzum Market do'kon menejjeri. Sharh javobini yozyapsan. Ohang: ${tone}. 2-3 jumla. O'zbek tilida.`;
  const r = await groq.chat.completions.create({
    model:"llama-3.3-70b-versatile", max_tokens:200,
    messages:[{role:"system",content:sys},{role:"user",content:`Отзыв (${rating}★): "${reviewText}"`}],
  });
  return r.choices[0].message.content.trim();
}

// Активные магазины мониторинга отзывов в памяти
const reviewBots = new Map(); // shopId → interval

function startReviewMonitoring(chatId, shopIdx) {
  const u = getUser(chatId);
  const shop = u.shops && u.shops[shopIdx];
  if (!shop) return;
  shop.active = true;
  shop.reviewsEnabled = true;
  saveUser(chatId, u);
  console.log(`✅ Review monitoring started for shop: ${shop.name}`);
}

function stopReviewMonitoring(chatId, shopIdx) {
  const u = getUser(chatId);
  if (!u.shops || !u.shops[shopIdx]) return;
  u.shops[shopIdx].reviewsEnabled = false;
  saveUser(chatId, u);
}

// ─── КОНТАКТЫ ────────────────────────────────────────────────────────────────
function showContacts(chatId) {
  const t = T(chatId), u = getUser(chatId), cl = u.clients || [];
  const addKb = { reply_markup:{ inline_keyboard:[[{ text:t.cAddBtn, callback_data:"crm_add" }]] } };
  if (!cl.length) return bot.sendMessage(chatId, t.cEmpty2, { parse_mode:"Markdown", ...addKb });
  let txt = t.cList;
  cl.forEach((c,i) => {
    txt += `*${i+1}. ${c.name}*\n`;
    if (c.username) txt += `  📱 ${c.username}\n`;
    if (c.phone)    txt += `  📞 ${c.phone}\n`;
    if (c.note)     txt += `  📝 ${c.note}\n`;
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
  if (s.step==="name")     { s.name=text; s.step="username"; bot.sendMessage(chatId,t.cS2(text),{parse_mode:"Markdown"}); return true; }
  if (s.step==="username") { s.username=no(text)?null:(text.startsWith("@")?text:"@"+text); s.step="phone"; bot.sendMessage(chatId,t.cS3(s.username),{parse_mode:"Markdown"}); return true; }
  if (s.step==="phone")    { s.phone=no(text)?null:text; s.step="note"; bot.sendMessage(chatId,t.cS4(s.phone),{parse_mode:"Markdown"}); return true; }
  if (s.step==="note") {
    s.note=no(text)?null:text; waitingCRM.delete(chatId);
    const u=getUser(chatId); u.clients=u.clients||[];
    u.clients.push({ id:Date.now(), name:s.name, username:s.username, phone:s.phone, note:s.note });
    saveUser(chatId,u);
    bot.sendMessage(chatId,t.cSaved(s),{parse_mode:"Markdown"});
    bot.sendMessage(chatId,"➕",{ reply_markup:{ inline_keyboard:[[{text:t.cMore,callback_data:"crm_add"},{text:t.cDone,callback_data:"crm_done"}]] }});
    return true;
  }
  return false;
}

bot.onText(/\/newclient/, (msg) => { if (msg.chat.type==="private") startCRM(msg.chat.id); });
bot.onText(/\/clients/,   (msg) => { if (msg.chat.type==="private") showContacts(msg.chat.id); });
bot.onText(/\/delclient (\d+)/, (msg, m) => {
  if (msg.chat.type!=="private") return;
  const id=msg.chat.id,t=T(id),u=getUser(id),i=+m[1]-1;
  if (!u.clients||i<0||i>=u.clients.length) return bot.sendMessage(id,t.cDelNF,mainKb(id));
  const name=u.clients.splice(i,1)[0].name; saveUser(id,u);
  bot.sendMessage(id,t.cDelOk(name),{parse_mode:"Markdown",...mainKb(id)});
});

// ─── ЗАДАЧИ ──────────────────────────────────────────────────────────────────
function parseTime(s) {
  const m=s.match(/(\d{1,2})[:.]+(\d{2})/);
  if(!m)return null;
  const h=+m[1],mn=+m[2];
  return(h>23||mn>59)?null:{h,m:mn};
}

bot.onText(/\/add (.+)/, (msg, m) => {
  const id=msg.chat.id,t=T(id),u=getUser(id); u.tasks=u.tasks||[];
  const raw=m[1].trim(),tm=raw.match(/^(\d{1,2}[:.]\d{2})\s+(.*)/);
  let text,time;
  if(tm){const p=parseTime(tm[1]);if(p){time=pad(p.h)+":"+pad(p.m);text=tm[2];}else text=raw;}else text=raw;
  u.tasks.push({id:Date.now(),text,time:time||null,done:false,r60:false,r0:false});
  saveUser(id,u);
  bot.sendMessage(id,t.tOk(u.tasks.length,text,time),{parse_mode:"Markdown",...mainKb(id)});
});

bot.onText(/\/done (\d+)/, (msg, m) => {
  const id=msg.chat.id,t=T(id),u=getUser(id),i=+m[1]-1;
  if(!u.tasks||i<0||i>=u.tasks.length)return bot.sendMessage(id,t.tNF,mainKb(id));
  u.tasks[i].done=true;saveUser(id,u);
  bot.sendMessage(id,t.tDone(u.tasks[i].text),{parse_mode:"Markdown",...mainKb(id)});
});

bot.onText(/\/del (\d+)/, (msg, m) => {
  const id=msg.chat.id,t=T(id),u=getUser(id),i=+m[1]-1;
  if(!u.tasks||i<0||i>=u.tasks.length)return bot.sendMessage(id,t.tNF,mainKb(id));
  const name=u.tasks.splice(i,1)[0].text;saveUser(id,u);
  bot.sendMessage(id,t.tDel(name),{parse_mode:"Markdown",...mainKb(id)});
});

bot.onText(/\/remind (\d+) (.+)/, (msg, m) => {
  const id=msg.chat.id,t=T(id),min=+m[1],txt=m[2].trim();
  if(min<1||min>1440)return bot.sendMessage(id,t.remBad,mainKb(id));
  setTimeout(()=>bot.sendMessage(id,t.remFire(txt),{parse_mode:"Markdown",...mainKb(id)}),min*60000);
  bot.sendMessage(id,t.remSet(min,txt),{parse_mode:"Markdown",...mainKb(id)});
});

function showTasks(chatId) {
  const t=T(chatId),u=getUser(chatId),tasks=u.tasks||[];
  if(!tasks.length)return bot.sendMessage(chatId,"*Задач нет*\n\n/add 14:30 Встреча",{parse_mode:"Markdown",...mainKb(chatId)});
  const pen=tasks.filter(x=>!x.done),dn=tasks.filter(x=>x.done);
  let txt="";
  if(pen.length){txt+="*"+pen.length+":*\n";tasks.forEach((tk,i)=>{if(!tk.done)txt+=(i+1)+". "+(tk.time?"🕐 "+tk.time+" ":"")+tk.text+"\n";});}
  if(dn.length) {txt+="\n*"+dn.length+":*\n";tasks.forEach((tk,i)=>{if(tk.done)txt+=(i+1)+". ~"+tk.text+"~\n";});}
  txt+="\n_/done N · /del N_";
  sendLong(chatId,txt);
}

setInterval(()=>{
  const db=loadDB(),now=new Date(),nowM=now.getHours()*60+now.getMinutes();
  let changed=false;
  Object.entries(db.users).forEach(([id,u])=>{
    if(!u.tasks)return;
    const t=TX[u.lang||"ru"];
    u.tasks.forEach(tk=>{
      if(tk.done||!tk.time)return;
      const p=parseTime(tk.time);if(!p)return;
      const diff=(p.h*60+p.m)-nowM;
      if(diff===60&&!tk.r60){bot.sendMessage(id,t.rem60(tk.text,tk.time),{parse_mode:"Markdown"});tk.r60=true;changed=true;}
      if(diff===0&&!tk.r0) {bot.sendMessage(id,t.rem0(tk.text,tk.time), {parse_mode:"Markdown"});tk.r0=true; changed=true;}
    });
    if(changed)db.users[id]=u;
  });
  try{fs.writeFileSync(DB_FILE,JSON.stringify(db));}catch(_){}
},60000);

// ─── ГРУППЫ И ТЕГИНГ ─────────────────────────────────────────────────────────
const pendingReplies = new Map();

bot.on("my_chat_member",(upd)=>{
  const c=upd.chat;
  if((c.type==="group"||c.type==="supergroup")&&["member","administrator"].includes(upd.new_chat_member?.status))
    saveGroup(String(c.id),{id:c.id,title:c.title});
});

bot.onText(/\/linkgroup/,(msg)=>{
  if(msg.chat.type!=="private")return;
  const id=msg.chat.id,t=T(id),gs=Object.values(getGroups());
  if(!gs.length)return bot.sendMessage(id,t.grpNone,{parse_mode:"Markdown",...mainKb(id)});
  bot.sendMessage(id,t.grpPick,{reply_markup:{inline_keyboard:gs.map(g=>[{text:g.title,callback_data:"grp_"+g.id}])}});
});

function parseTag(text) {
  const pp=[
    /(?:спроси\s+у|спроси|ask)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:напомни|скажи|remind|тегни|ping)\s+([а-яёА-ЯЁa-zA-Z]+)\s+(.+)/i,
    /(?:so['']ra(?:gin)?)\s+([a-zA-Zа-яёА-ЯЁ]+)(?:\s+dan)?\s+(.+)/i,
  ];
  for(const p of pp){const m=text.match(p);if(m)return{name:m[1],msg:m[2]};}
  return null;
}

async function doTag(chatId,req){
  const t=T(chatId),u=getUser(chatId);
  if(!u.groupId)return bot.sendMessage(chatId,t.noGroup,{parse_mode:"Markdown",...mainKb(chatId)});
  const cl=(u.clients||[]).find(c=>c.name.toLowerCase().includes(req.name.toLowerCase()));
  if(!cl)return bot.sendMessage(chatId,t.tagNF(req.name),{parse_mode:"Markdown",...mainKb(chatId)});
  if(!cl.username)return bot.sendMessage(chatId,t.noUser(cl.name),{parse_mode:"Markdown",...mainKb(chatId)});
  try{
    const owner=u.name||"Менеджер";
    const grpMsg=u.lang==="uz"
      ?owner+" deydi: "+cl.username+", "+req.msg
      :owner+" говорит: "+cl.username+", "+req.msg;
    await bot.sendMessage(u.groupId,grpMsg);
    const key=u.groupId+":"+cl.username.toLowerCase();
    pendingReplies.set(key,{ownerChatId:chatId,clientName:cl.name,lang:u.lang||"ru"});
    setTimeout(()=>pendingReplies.delete(key),24*60*60*1000);
    bot.sendMessage(chatId,t.tagSent(cl.username,req.msg),{parse_mode:"Markdown",...mainKb(chatId)});
  }catch(_){bot.sendMessage(chatId,t.tagErr,mainKb(chatId));}
}



// ─── ИНСТРУКЦИЯ ──────────────────────────────────────────────────────────────

const UZUM_CONNECT_URL = process.env.UZUM_CONNECT_URL || "https://YOUR-SITE.github.io/uzum-connect.html";

function showInstruction(chatId) {
  const uz = (getUser(chatId).lang || "ru") === "uz";

  if (uz) {
    bot.sendMessage(chatId,
      "*📖 Ko'rsatma — Nexus Bot*\n\n" +

      "*🏪 Uzum do'konini ulash:*\n" +
      "1️⃣ Quyidagi havolani oching\n" +
      "2️⃣ seller.uzum.uz ga kiring\n" +
      "3️⃣ «Tokenni olish» tugmasini bosing\n" +
      "4️⃣ Nusxa oling va botga yuboring: /settoken TOKEN\n\n" +

      "*🤖 Buyruqlar:*\n" +
      "`/settoken TOKEN` — do'konni ulash\n" +
      "`/mytoken` — ulanish holatini ko'rish\n" +
      "`/add 14:30 Vazifa` — vazifa qo'shish\n" +
      "`/done 1` — bajarildi\n" +
      "`/del 1` — o'chirish\n" +
      "`/remind 30 Matn` — eslatma\n" +
      "`/newclient` — kontakt qo'shish\n" +
      "`/linkgroup` — guruh ulash\n" +
      "`/lang` — tilni o'zgartirish",
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[
          { text: "🔑 Uzum tokenini olish →", url: UZUM_CONNECT_URL }
        ]]},
        ...mainKb(chatId),
      }
    );
  } else {
    bot.sendMessage(chatId,
      "*📖 Инструкция — Nexus Bot*\n\n" +

      "*🏪 Подключить магазин Uzum:*\n" +
      "1️⃣ Откройте ссылку ниже\n" +
      "2️⃣ Войдите на seller.uzum.uz\n" +
      "3️⃣ Нажмите «Получить токен автоматически»\n" +
      "4️⃣ Скопируйте и отправьте боту: /settoken TOKEN\n\n" +

      "*🛒 Добавить магазин вручную:*\n" +
      "🛒 Маркетплейсы → ➕ Добавить магазин → 3 шага\n\n" +

      "*📋 Команды:*\n" +
      "`/settoken ТОКЕН` — подключить магазин\n" +
      "`/mytoken` — статус подключения\n" +
      "`/add 14:30 Встреча` — добавить задачу\n" +
      "`/done 1` — задача выполнена\n" +
      "`/del 1` — удалить задачу\n" +
      "`/remind 30 Текст` — напомнить через 30 мин\n" +
      "`/newclient` — добавить контакт\n" +
      "`/linkgroup` — привязать группу\n" +
      "`/lang` — сменить язык",
      {
        parse_mode: "Markdown",
        reply_markup: { inline_keyboard: [[
          { text: "🔑 Получить токен Uzum →", url: UZUM_CONNECT_URL }
        ]]},
        ...mainKb(chatId),
      }
    );
  }
}

// ─── UZUM TOKEN — хранение и использование ──────────────────────────────────

bot.onText(/\/settoken (.+)/, async (msg, match) => {
  if (msg.chat.type !== "private") return;
  const id    = msg.chat.id;
  const token = match[1].trim().replace(/^Bearer\s+/i, "");
  const u     = getUser(id);

  // Проверяем токен через Uzum API
  const checkMsg = await bot.sendMessage(id, "🔍 Проверяю токен...");
  try {
    const resp = await axios.get("https://api.uzum.uz/api/seller/shop", {
      headers: { "Authorization": "Bearer " + token, "Accept": "application/json" },
      timeout: 10000,
    });
    const shopName = resp.data?.payload?.title || resp.data?.name || resp.data?.shopName || null;

    u.uzumToken = token;
    u.uzumShop  = shopName || "Ваш магазин";
    saveUser(id, u);

    await bot.deleteMessage(id, checkMsg.message_id);
    bot.sendMessage(id,
      "✅ *Токен подключён!*\n\n" +
      "🏪 Магазин: *" + (shopName || "подключён") + "*\n\n" +
      "Теперь бот работает напрямую с вашим магазином:\n" +
      "• ⭐ Автоответы на отзывы — в реальном времени\n" +
      "• ⚠️ Low stock — живые остатки\n" +
      "• 📈 Аналитика — без выгрузки файлов",
      { parse_mode: "Markdown", ...mainKb(id) }
    );
  } catch (e) {
    await bot.deleteMessage(id, checkMsg.message_id);
    const code = e.response?.status;
    if (code === 401 || code === 403) {
      bot.sendMessage(id,
        "❌ *Токен недействителен или истёк*\n\n" +
        "Получите новый токен:\n" +
        "1. Откройте страницу подключения\n" +
        "2. Войдите в seller.uzum.uz\n" +
        "3. Нажмите «Получить токен»",
        { parse_mode: "Markdown", ...mainKb(id) }
      );
    } else {
      // Токен принят но API не ответил стандартно — сохраняем
      u.uzumToken = token;
      u.uzumShop  = "Ваш магазин";
      saveUser(id, u);
      await bot.deleteMessage(id, checkMsg.message_id);
      bot.sendMessage(id,
        "✅ *Токен сохранён!*\n\nБот подключён к вашему магазину.",
        { parse_mode: "Markdown", ...mainKb(id) }
      );
    }
  }
});

bot.onText(/\/mytoken/, (msg) => {
  if (msg.chat.type !== "private") return;
  const id = msg.chat.id;
  const u  = getUser(id);
  if (!u.uzumToken) {
    return bot.sendMessage(id,
      "❌ Токен не подключён.\n\nОтправьте /settoken ВАШ_ТОКЕН",
      mainKb(id)
    );
  }
  const short = u.uzumToken.slice(0, 12) + "..." + u.uzumToken.slice(-6);
  bot.sendMessage(id,
    "🔑 *Uzum токен подключён*\n\n" +
    "🏪 Магазин: *" + u.uzumShop + "*\n" +
    "🔐 Токен: `" + short + "`\n\n" +
    "Для смены токена отправьте /settoken НОВЫЙ_ТОКЕН",
    { parse_mode: "Markdown", ...mainKb(id) }
  );
});

// ─── ГОЛОС ───────────────────────────────────────────────────────────────────
bot.on("voice",async(msg)=>{
  if(msg.chat.type!=="private")return;
  const id=msg.chat.id,t=T(id);
  const st=await bot.sendMessage(id,t.voiceWait);
  bot.sendChatAction(id,"typing");
  const fp=path.join("/tmp","v_"+msg.voice.file_id+".ogg");
  try{
    const info=await bot.getFile(msg.voice.file_id);
    const url="https://api.telegram.org/file/bot"+TOKEN+"/"+info.file_path;
    const dl=await axios({url,responseType:"arraybuffer",timeout:20000});
    fs.writeFileSync(fp,Buffer.from(dl.data));
    const form=new FormData();
    form.append("file",fs.createReadStream(fp),{filename:"voice.ogg",contentType:"audio/ogg"});
    form.append("model","whisper-large-v3-turbo");
    form.append("language",getUser(id).lang==="uz"?"uz":"ru");
    form.append("response_format","text");
    const wr=await axios.post("https://api.groq.com/openai/v1/audio/transcriptions",form,{
      headers:{"Authorization":"Bearer "+GROQ_KEY,...form.getHeaders()},timeout:30000,
    });
    fs.unlink(fp,()=>{});
    const recognized=(typeof wr.data==="string"?wr.data:wr.data.text||"").trim();
    if(!recognized)return bot.editMessageText(t.voiceErr,{chat_id:id,message_id:st.message_id});
    await bot.editMessageText(t.voiceSaid(recognized),{chat_id:id,message_id:st.message_id,parse_mode:"Markdown"});
    const tag=parseTag(recognized);
    if(tag){await bot.deleteMessage(id,st.message_id);return doTag(id,tag);}
    const reply=await ai(id,recognized);
    await bot.deleteMessage(id,st.message_id);
    sendLong(id,"🎤 _"+recognized+"_\n\n"+reply);
  }catch(e){
    console.error("VOICE:",e.response?.data||e.message);
    try{fs.unlinkSync(fp);}catch(_){}
    bot.editMessageText(t.voiceErr,{chat_id:id,message_id:st.message_id});
  }
});

// ─── ФАЙЛЫ ───────────────────────────────────────────────────────────────────
bot.on("document",async(msg)=>{
  if(msg.chat.type!=="private")return;
  const id=msg.chat.id,t=T(id),doc=msg.document,name=doc.file_name||"";
  if(![".xlsx",".xls",".csv"].some(e=>name.endsWith(e)))return bot.sendMessage(id,t.fileNo,mainKb(id));
  const st=await bot.sendMessage(id,t.fileRead(name),{parse_mode:"Markdown"});
  bot.sendChatAction(id,"typing");
  try{
    const info=await bot.getFile(doc.file_id);
    const url="https://api.telegram.org/file/bot"+TOKEN+"/"+info.file_path;
    const fp=path.join("/tmp","f_"+doc.file_id+path.extname(info.file_path));
    const dl=await axios({url,responseType:"arraybuffer",timeout:20000});
    fs.writeFileSync(fp,Buffer.from(dl.data));
    const wb=XLSX.readFile(fp);let data="";
    wb.SheetNames.forEach(s=>{data+="\n=== "+s+" ===\n";XLSX.utils.sheet_to_json(wb.Sheets[s],{header:1}).slice(0,100).forEach(r=>{data+=r.join(" | ")+"\n";});});
    fs.unlink(fp,()=>{});data=data.slice(0,8000);
    await bot.editMessageText(t.fileAna,{chat_id:id,message_id:st.message_id});
    const u=getUser(id),prev=u.mode;u.mode="analyst";saveUser(id,u);
    const reply=await ai(id,msg.caption||t.analyzeQ,'"'+name+'":\n```\n'+data+'\n```');
    u.mode=prev;saveUser(id,u);
    await bot.deleteMessage(id,st.message_id);
    sendLong(id,t.fileRes(name)+reply);
  }catch(e){console.error("FILE:",e.message);bot.editMessageText(t.fileErr,{chat_id:id,message_id:st.message_id});}
});

// ─── CALLBACKS ───────────────────────────────────────────────────────────────
bot.on("callback_query",async(q)=>{
  const id=q.message.chat.id;
  bot.answerCallbackQuery(q.id);
  const d=q.data;

  if(d==="lang_ru"||d==="lang_uz"){
    const lang=d==="lang_ru"?"ru":"uz",u=getUser(id);
    u.lang=lang;saveUser(id,u);
    if(!u.ready){waitingName.add(id);return bot.sendMessage(id,TX[lang].askName,{reply_markup:{remove_keyboard:true}});}
    return bot.sendMessage(id,TX[lang].langOk,{parse_mode:"Markdown",...mainKb(id)});
  }

  // Режимы
  if(d.startsWith("mode_")){
    const modeKey=d.replace("mode_",""),u=getUser(id);
    u.mode=modeKey;u.submode=null;u.history=[];saveUser(id,u);
    showSubDepts(id,modeKey);return;
  }

  if(d.startsWith("sub_")){
    const subId=d.replace("sub_",""),u=getUser(id);
    u.submode=subId;u.history=[];saveUser(id,u);
    const w=SUB_WELCOME[subId]||"Раздел выбран. Задайте вопрос!";
    return bot.sendMessage(id,w,{parse_mode:"Markdown",...mainKb(id)});
  }

  // Контакты
  if(d==="crm_add"){startCRM(id);return;}
  if(d==="crm_done"){showDashboard(id);return;}

  // Группы
  if(d.startsWith("grp_")){
    const gid=d.replace("grp_",""),g=getGroups()[gid],u=getUser(id);
    u.groupId=gid;saveUser(id,u);
    return bot.sendMessage(id,T(id).grpOk(g.title),{parse_mode:"Markdown",...mainKb(id)});
  }

  // Маркетплейсы
  if(d==="mp_add"){
    // ШАГ 1: инструкция по добавлению сотрудника
    bot.sendMessage(id,
      "*🏪 Добавление магазина*\n\n*Шаг 1 из 3 — Добавьте сотрудника*\n\nЗайдите в:\n*Uzum Sellers → Настройки → Сотрудники → Добавить сотрудника*\n\nНомер: 📞 *" + EMPLOYEE_PHONE + "*\nРоль: *Работник ЦПТ*\n\nПосле добавления нажмите кнопку:",
      {
        parse_mode:"Markdown",
        reply_markup:{ inline_keyboard:[[
          { text:"✅ Добавил сотрудника — к шагу 2", callback_data:"mp_step1_done" }
        ]]}
      }
    );
    return;
  }

  // ШАГ 1 подтверждён — переходим к вводу ID
  if(d==="mp_step1_done"){
    waitingShop.set(id,{ step:"id" });
    bot.sendMessage(id,
      "*Шаг 2 из 3 — ID магазина*\n\nВведите ID вашего магазина на Uzum:\n\n_Найти: seller.uzum.uz → Профиль магазина → ID_",
      { parse_mode:"Markdown", reply_markup:{ remove_keyboard:true } }
    );
    return;
  }

  // ШАГ 3 — подтверждение магазина кнопкой
  if(d==="mp_confirm_shop"){
    const s=waitingShop.get(id);
    if(!s)return;
    waitingShop.delete(id);
    const u=getUser(id); u.shops=u.shops||[];
    u.shops.push({ id:Date.now(), name:s.shopName, shopId:s.shopId, active:true, reviewsEnabled:false, addedAt:new Date().toISOString() });
    saveUser(id,u);
    bot.sendMessage(id,
      "🎉 *Магазин \"" + (s.shopName||"") + "\" добавлен!*\n\nТеперь включите автоответчик:\n🛒 Маркетплейсы → Отзывы → 🤖 Автоответчик",
      { parse_mode:"Markdown", ...mainKb(id) }
    );
    return;
  }

  // Маркетплейс — раздел (6 больших кнопок)
  if(d.startsWith("mps_")){
    const sectionId=d.replace("mps_","");
    showMPSection(id,sectionId);
    return;
  }

  // Маркетплейс — специальные подразделы
  if(d==="mpx_mp_r_auto"){
    const u=getUser(id);
    const shops=u.shops||[];
    if(!shops.length){
      return bot.sendMessage(id,
        "⚠️ *Сначала добавьте магазин!*\n\n🛒 Маркетплейсы → Добавить магазин",
        {parse_mode:"Markdown",...mainKb(id)}
      );
    }
    const btns=shops.map((s,i)=>[{
      text:(s.reviewsEnabled?"✅ ":"⛔ ")+s.name,
      callback_data:"mp_rev_toggle_"+i
    }]);
    btns.push([{text:"◀️ Назад",callback_data:"mps_mp_reviews"}]);
    bot.sendMessage(id,
      "🤖 *Автоответчик на отзывы*\n\nНажмите на магазин чтобы включить/выключить:",
      {parse_mode:"Markdown",reply_markup:{inline_keyboard:btns}}
    );
    return;
  }

  if(d.startsWith("mp_rev_toggle_")){
    const idx=+d.replace("mp_rev_toggle_","");
    const u=getUser(id);
    if(!u.shops||!u.shops[idx])return;
    u.shops[idx].reviewsEnabled=!u.shops[idx].reviewsEnabled;
    saveUser(id,u);
    const s=u.shops[idx];
    const icon=s.reviewsEnabled?"✅":"⛔";
    const status=s.reviewsEnabled?"включён":"выключен";
    bot.sendMessage(id,
      icon+" *Автоответчик для \""+s.name+"\" "+status+"*",
      {parse_mode:"Markdown",...mainKb(id)}
    );
    return;
  }

  if(d==="mpx_mp_p_stock"){
    const u=getUser(id);
    if(!u.shops||!u.shops.length){
      return bot.sendMessage(id,
        "⚠️ *Сначала добавьте магазин!*\n\nLow Stock отслеживается только для добавленных магазинов.\n\n🛒 Маркетплейсы → Добавить магазин",
        {parse_mode:"Markdown",...mainKb(id)}
      );
    }
    const subId="mp_p_stock";
    const u2=getUser(id);u2.mode="mp_custom";u2.submode=subId;u2.history=[];saveUser(id,u2);
    const shopNames=u.shops.map(s=>s.name).join(", ");
    bot.sendMessage(id,
      "⚠️ *Low Stock — остатки товаров*\n\nВаши магазины: "+shopNames+"\n\nОпишите ваши товары и текущие остатки — помогу настроить пороги и напоминания:",
      {parse_mode:"Markdown",...mainKb(id)}
    );
    return;
  }

  if(d==="mpx_mp_p_unit"){
    const u=getUser(id);u.mode="mp_custom";u.submode="mp_p_unit";u.history=[];saveUser(id,u);
    // Отправляем шаблон Excel
    const templateText =
      "📊 *Расчёт юнит-экономики*\n\n"+
      "Пришлите заполненные данные по товару в формате:\n\n"+
      "• Себестоимость: ___ сум\n"+
      "• Цена продажи: ___ сум\n"+
      "• Комиссия Uzum (%): ___\n"+
      "• Стоимость логистики: ___ сум\n"+
      "• Расходы на рекламу: ___ сум/мес\n"+
      "• Объём продаж: ___ шт/мес\n\n"+
      "_Или загрузите .xlsx файл с данными — заполню расчёт_";
    bot.sendMessage(id,templateText,{parse_mode:"Markdown",...mainKb(id)});
    return;
  }

  if(d==="mpx_mp_p_prices"){
    const u=getUser(id);u.mode="mp_custom";u.submode="mp_p_prices";u.history=[];saveUser(id,u);
    bot.sendMessage(id,
      "💰 *Трекер цен конкурентов*\n\n"+
      "Бот ищет цены напрямую через Uzum Market API.\n\n"+
      "Введите название товара для поиска:\n"+
      "_например: «смартфон Samsung» или «наушники TWS»_",
      {parse_mode:"Markdown",...mainKb(id)}
    );
    return;
  }

  // Маркетплейс — остальные подразделы (AI режим)
  if(d.startsWith("mpx_")){
    const subId=d.replace("mpx_","");
    const u=getUser(id);
    u.mode="mp_custom";
    u.submode=subId;
    u.history=[];
    saveUser(id,u);
    const welcome=MP_SUB_WELCOME[subId]||"Раздел выбран. Задайте вопрос!";
    bot.sendMessage(id,welcome,{parse_mode:"Markdown",...mainKb(id)});
    return;
  }

  // Назад к маркетплейсам
  if(d==="mp_back"){
    showMarketplaces(id);
    return;
  }

  if(d==="mp_list"){showShopList(id);return;}

  if(d.startsWith("mp_check_")){
    const shopIdx=+d.replace("mp_check_",""),t=T(id);
    startReviewMonitoring(id,shopIdx);
    const u=getUser(id);
    const shopName=u.shops&&u.shops[shopIdx]?u.shops[shopIdx].name:"магазин";
    bot.sendMessage(id,t.mpActive(shopName),{parse_mode:"Markdown",...mainKb(id)});
    return;
  }

  if(d.startsWith("mp_rev_")){
    const shopIdx=+d.replace("mp_rev_",""),t=T(id);
    const u=getUser(id);
    if(!u.shops||!u.shops[shopIdx])return;
    const shop=u.shops[shopIdx];
    shop.reviewsEnabled=!shop.reviewsEnabled;
    saveUser(id,u);
    bot.sendMessage(id,t.mpRevToggle(shop.name,shop.reviewsEnabled),{parse_mode:"Markdown",...mainKb(id)});
    return;
  }

  if(d.startsWith("mp_del_")){
    const shopIdx=+d.replace("mp_del_",""),t=T(id);
    const u=getUser(id);
    if(!u.shops||!u.shops[shopIdx])return;
    const name=u.shops.splice(shopIdx,1)[0].name;
    saveUser(id,u);
    bot.sendMessage(id,t.mpDelOk(name),{parse_mode:"Markdown",...mainKb(id)});
    return;
  }

  // Переключение режима в группе через кнопку
  if(d.startsWith("gm_")){
    const modeKey=d.replace("gm_",""),chatId=q.message.chat.id;
    groupMode[chatId]=modeKey;
    const msgs={
      general:"🤖 *Бизнес*\n\nЗадайте вопрос!",
      brainstorm:"💡 *Идеи*\n\nОпишите задачу!",
      text:"✏️ *Тексты*\n\nЧто написать?",
      analyst:"📈 *Аналитик*\n\nЗадайте вопрос по данным!",
      law:"⚖️ *Законы*\n\nЗадайте юридический вопрос!",
      accountant:"🧮 *Бухгалтер*\n\nЗадайте вопрос!",
      time:"⏰ *Тайм*\n\nПеречислите задачи!",
    };
    return bot.sendMessage(chatId,msgs[modeKey]||"Режим выбран!",{parse_mode:"Markdown"});
  }
});

// ─── ГРУППА ──────────────────────────────────────────────────────────────────
const groupMode={};
const GROUP_CMDS={
  "/business":"general","/biznes":"general",
  "/ideas":"brainstorm","/goyalar":"brainstorm",
  "/text":"text","/тексты":"text",
  "/analyst":"analyst","/analysis":"analyst","/аналитик":"analyst",
  "/law":"law","/qonun":"law",
  "/accountant":"accountant","/hisobchi":"accountant",
  "/time":"time","/vaqt":"time",
};

function groupMenuKb(){
  return{reply_markup:{inline_keyboard:[
    [{text:"🤖 Бизнес",callback_data:"gm_general"},{text:"💡 Идеи",callback_data:"gm_brainstorm"}],
    [{text:"✏️ Тексты",callback_data:"gm_text"},{text:"📈 Аналитик",callback_data:"gm_analyst"}],
    [{text:"⚖️ Законы",callback_data:"gm_law"},{text:"🧮 Бухгалтер",callback_data:"gm_accountant"}],
    [{text:"⏰ Тайм",callback_data:"gm_time"}],
  ]}};
}


// ─── UZUM API — поиск цен ────────────────────────────────────────────────────
async function fetchUzumPrices(query) {
  try {
    const url = "https://api.uzum.uz/api/v2/main/search/product?searchText=" +
                encodeURIComponent(query) + "&size=10&page=0";
    const resp = await axios.get(url, {
      timeout: 10000,
      headers: {
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
        "x-iid": "default",
      },
    });
    const items = resp.data?.productList || resp.data?.products ||
                  resp.data?.payload?.products || resp.data?.data || [];
    if (!items.length) return null;
    return items.slice(0, 8).map(p => ({
      name:  p.title || p.name || p.productTitle || "—",
      price: p.sellPrice || p.price || p.minSellPrice || 0,
      shop:  p.shopTitle || p.shopName || p.seller?.name || "—",
      url:   p.productId ? "https://uzum.uz/product/" + p.productId : null,
    }));
  } catch (e) {
    console.error("Uzum API:", e.message);
    return null;
  }
}

// ─── ГЛАВНЫЙ ОБРАБОТЧИК ───────────────────────────────────────────────────────
bot.on("message",async(msg)=>{
  const id=msg.chat.id,text=msg.text;
  if(!text)return;

  // ── ГРУППА ──────────────────────────────────────────────────────────────────
  if(msg.chat.type==="group"||msg.chat.type==="supergroup"){
    const cmd=text.split("@")[0].toLowerCase().trim();
    if(["/menu","/start","/help"].includes(cmd)){
      return bot.sendMessage(id,
        "*Nexus Bot*\n\nВыберите режим:\n/analyst · /business · /ideas\n/law · /accountant · /time\n\n_@"+BOT_USERNAME+" вопрос — задать вопрос_",
        {parse_mode:"Markdown",...groupMenuKb()}
      );
    }
    if(GROUP_CMDS[cmd]){
      groupMode[id]=GROUP_CMDS[cmd];
      const names={general:"🤖 Бизнес",brainstorm:"💡 Идеи",text:"✏️ Тексты",analyst:"📈 Аналитик",law:"⚖️ Законы",accountant:"🧮 Бухгалтер",time:"⏰ Тайм"};
      return bot.sendMessage(id,"*"+names[GROUP_CMDS[cmd]]+"*\nЗадайте вопрос!",{parse_mode:"Markdown"});
    }
    // Ответы на тегинг
    if(msg.from?.username){
      const key=String(id)+":@"+msg.from.username.toLowerCase();
      const p=pendingReplies.get(key);
      if(p){
        const txt=text.trim().toLowerCase();
        const isYes=["да","yes","ha","ok","ок","готово","tayyor","done","сделал","сделала","готов","готова"].some(w=>txt===w||txt.startsWith(w));
        const isNo=["нет","no","yo'q","yoq","не готово","ещё нет","не сделал"].some(w=>txt===w||txt.startsWith(w));
        if(isYes){pendingReplies.delete(key);return bot.sendMessage(p.ownerChatId,"✅ *"+p.clientName+"* ответил: *Да*, готово!",{parse_mode:"Markdown"});}
        if(isNo) {pendingReplies.delete(key);return bot.sendMessage(p.ownerChatId,"❌ *"+p.clientName+"* ответил: *Нет*, ещё не готово.",{parse_mode:"Markdown"});}
        return bot.sendMessage(p.ownerChatId,"💬 *"+p.clientName+"* пишет:\n_\""+text+"\"_",{parse_mode:"Markdown"});
      }
    }
    // Ответ при упоминании
    const mentioned=BOT_USERNAME&&text.includes("@"+BOT_USERNAME);
    const replyToBot=msg.reply_to_message?.from?.is_bot;
    if(!mentioned&&!replyToBot)return;
    const q=text.replace("@"+(BOT_USERNAME||""),"").trim();
    if(!q)return;
    bot.sendChatAction(id,"typing");
    try{
      const mode=groupMode[id]||"general";
      const sys=BASE_SYS[mode]?BASE_SYS[mode].ru:BASE_SYS.general.ru;
      const reply=await callAI(sys,[{role:"user",content:q}]);
      bot.sendMessage(id,reply,{parse_mode:"Markdown",reply_to_message_id:msg.message_id});
    }catch(e){console.error("Group AI:",e.message);}
    return;
  }

  // ── ЛИЧКА ───────────────────────────────────────────────────────────────────
  const u=getUser(id);
  if(!u.lang)return showLangPicker(id);
  const t=T(id);

  // Онбординг
  if(waitingName.has(id)){
    waitingName.delete(id);
    u.name=text.trim();u.ready=true;saveUser(id,u);
    return bot.sendMessage(id,t.welcome(u.name),{parse_mode:"Markdown",...mainKb(id)});
  }

  // CRM шаги
  if(waitingCRM.has(id)){if(await handleCRM(id,text))return;}

  // Магазин шаги
  if(waitingShop.has(id)){if(await handleShopAdd(id,text))return;}

  // Кнопки главного меню
  if(text===t.btn.modes)    {showModesMenu(id);return;}
  if(text===t.btn.contacts) {showContacts(id);return;}
  if(text===t.btn.mp)       {showMarketplaces(id);return;}
  if(text===t.btn.tasks)    {showTasks(id);return;}
  if(text===t.btn.help)     {bot.sendMessage(id,t.help,{parse_mode:"Markdown",...mainKb(id)});return;}
  if(text===t.btn.instr)    {showInstruction(id);return;}
  if(text===t.btn.reset)    {u.history=[];u.submode=null;saveUser(id,u);bot.sendMessage(id,t.histOk,mainKb(id));return;}
  if(text.startsWith("/"))  return;

  // Google Sheets
  if(text.includes("docs.google.com/spreadsheets")){
    const st=await bot.sendMessage(id,t.shLoad);bot.sendChatAction(id,"typing");
    try{
      const m=text.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);if(!m)throw new Error();
      const r=await axios.get("https://docs.google.com/spreadsheets/d/"+m[1]+"/export?format=csv",{responseType:"text",timeout:15000});
      await bot.editMessageText(t.shAna,{chat_id:id,message_id:st.message_id});
      const prev=u.mode;u.mode="analyst";saveUser(id,u);
      const reply=await ai(id,t.analyzeQ,"```\n"+r.data.slice(0,8000)+"\n```");
      u.mode=prev;saveUser(id,u);
      await bot.deleteMessage(id,st.message_id);sendLong(id,t.shRes+reply);
    }catch(_){bot.editMessageText(t.shErr,{chat_id:id,message_id:st.message_id});}
    return;
  }

  // Тегинг
  const tag=parseTag(text);if(tag)return doTag(id,tag);

  // Поиск цен на Uzum (режим mp_p_prices)
  if(u.mode==="mp_custom"&&u.submode==="mp_p_prices"){
    bot.sendChatAction(id,"typing");
    const prices=await fetchUzumPrices(text);
    if(prices&&prices.length){
      let resp="💰 *Цены на Uzum: «"+text+"»*\n\n";
      const sorted=[...prices].sort((a,b)=>a.price-b.price);
      sorted.forEach((p,i)=>{
        const priceStr=p.price?p.price.toLocaleString("ru-RU")+" сум":"—";
        resp+=(i+1)+". *"+p.name.slice(0,50)+"*\n";
        resp+="   💵 "+priceStr+"  |  🏪 "+p.shop+"\n\n";
      });
      const minP=sorted[0], maxP=sorted[sorted.length-1];
      if(minP&&maxP&&minP.price&&maxP.price){
        resp+="─────────────\n";
        resp+="📉 Мин: *"+minP.price.toLocaleString("ru-RU")+" сум*\n";
        resp+="📈 Макс: *"+maxP.price.toLocaleString("ru-RU")+" сум*\n";
        const avg=Math.round(sorted.reduce((s,p)=>s+(p.price||0),0)/sorted.length);
        resp+="📊 Среднее: *"+avg.toLocaleString("ru-RU")+" сум*";
      }
      sendLong(id,resp);
    } else {
      bot.sendMessage(id,
        "❌ Товар не найден на Uzum.\n\nПопробуйте другое название:",
        mainKb(id)
      );
    }
    return;
  }

  // Обычный вопрос
  bot.sendChatAction(id,"typing");
  try{
    const reply=await ai(id,text);
    sendLong(id,reply);
  }catch(e){
    console.error("AI:",e.message);
    bot.sendMessage(id,"Ошибка. Попробуйте ещё раз.",mainKb(id));
  }
});

console.log("Nexus Bot started!");
