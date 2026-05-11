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
    modeOk:       (l) => `🔄 Я переключился в режим *${l}*\n\nТеперь отвечаю как ${l}. Задайте вопрос!`,
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
    modeOk:       (l) => `🔄 Men *${l}* rejimiga o'tdim\n\nEndi ${l} sifatida javob beraman. Savol bering!`,
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
//  ПОДРАЗДЕЛЫ РЕЖИМОВ
// ════════════════════════════════════════════════════════════════════════════

const SUBDEPTS = {
  general: {
    icon: "🤖",
    ru: { title: "Бизнес", desc: "Выберите направление:", subs: [
      { id: "general_strategy",   label: "📊 Стратегия и управление" },
      { id: "general_marketing",  label: "📣 Маркетинг и реклама"    },
      { id: "general_sales",      label: "💰 Продажи и переговоры"   },
      { id: "general_startup",    label: "🚀 Стартап и запуск"       },
      { id: "general_hr",         label: "👥 HR и команда"           },
    ]},
    uz: { title: "Biznes", desc: "Yo'nalishni tanlang:", subs: [
      { id: "general_strategy",   label: "📊 Strategiya va boshqaruv" },
      { id: "general_marketing",  label: "📣 Marketing va reklama"    },
      { id: "general_sales",      label: "💰 Savdo va muzokaralar"    },
      { id: "general_startup",    label: "🚀 Startup va ishga tushirish" },
      { id: "general_hr",         label: "👥 HR va jamoa"             },
    ]},
  },
  brainstorm: {
    icon: "💡",
    ru: { title: "Идеи", desc: "Что генерируем?", subs: [
      { id: "brain_product",      label: "📦 Новый продукт/услуга"   },
      { id: "brain_marketing",    label: "📢 Маркетинговые идеи"     },
      { id: "brain_monetize",     label: "💵 Монетизация"            },
      { id: "brain_content",      label: "🎬 Контент и соц сети"     },
      { id: "brain_innovation",   label: "⚡ Инновации и автоматизация" },
    ]},
    uz: { title: "G'oyalar", desc: "Nima generatsiya qilamiz?", subs: [
      { id: "brain_product",      label: "📦 Yangi mahsulot/xizmat"  },
      { id: "brain_marketing",    label: "📢 Marketing g'oyalari"    },
      { id: "brain_monetize",     label: "💵 Monetizatsiya"          },
      { id: "brain_content",      label: "🎬 Kontent va ijtimoiy tarmoqlar" },
      { id: "brain_innovation",   label: "⚡ Innovatsiya va avtomatizatsiya" },
    ]},
  },
  text: {
    icon: "✏️",
    ru: { title: "Тексты", desc: "Какой текст нужен?", subs: [
      { id: "text_email",         label: "📧 Деловые письма"         },
      { id: "text_contract",      label: "📃 Договоры и документы"   },
      { id: "text_social",        label: "📱 Посты для соц сетей"    },
      { id: "text_ads",           label: "📣 Реклама и объявления"   },
      { id: "text_report",        label: "📊 Отчёты и презентации"   },
    ]},
    uz: { title: "Matnlar", desc: "Qanday matn kerak?", subs: [
      { id: "text_email",         label: "📧 Ishbilarmonlik xatlari" },
      { id: "text_contract",      label: "📃 Shartnomalar"           },
      { id: "text_social",        label: "📱 Ijtimoiy tarmoq postlari" },
      { id: "text_ads",           label: "📣 Reklama va e'lonlar"    },
      { id: "text_report",        label: "📊 Hisobotlar va taqdimotlar" },
    ]},
  },
  analyst: {
    icon: "📈",
    ru: { title: "Аналитик", desc: "Выберите направление анализа:", subs: [
      { id: "analyst_marketplace", label: "🛒 Маркетплейсы"           },
      { id: "analyst_local",       label: "🏪 Местный рынок"          },
      { id: "analyst_social",      label: "📊 Анализ соц сетей"       },
      { id: "analyst_stocks",      label: "📉 Фондовый рынок / Акции" },
      { id: "analyst_crypto",      label: "🪙 Криптовалюта"           },
    ]},
    uz: { title: "Tahlilchi", desc: "Tahlil yo'nalishini tanlang:", subs: [
      { id: "analyst_marketplace", label: "🛒 Marketpleyslar"         },
      { id: "analyst_local",       label: "🏪 Mahalliy bozor"         },
      { id: "analyst_social",      label: "📊 Ijtimoiy tarmoqlar tahlili" },
      { id: "analyst_stocks",      label: "📉 Fond bozori / Aksiyalar" },
      { id: "analyst_crypto",      label: "🪙 Kriptovalyuta"          },
    ]},
  },
  law: {
    icon: "⚖️",
    ru: { title: "Законы", desc: "Выберите область права:", subs: [
      { id: "law_tax",            label: "🧾 Налоговый кодекс"        },
      { id: "law_labor",          label: "👷 Трудовое право"          },
      { id: "law_business",       label: "🏢 Предпринимательство"     },
      { id: "law_civil",          label: "📜 Гражданское право"       },
      { id: "law_customs",        label: "🛃 Таможня и ВЭД"          },
    ]},
    uz: { title: "Qonunlar", desc: "Huquq sohasini tanlang:", subs: [
      { id: "law_tax",            label: "🧾 Soliq kodeksi"           },
      { id: "law_labor",          label: "👷 Mehnat huquqi"           },
      { id: "law_business",       label: "🏢 Tadbirkorlik"            },
      { id: "law_civil",          label: "📜 Fuqarolik huquqi"        },
      { id: "law_customs",        label: "🛃 Bojxona va tashqi savdo" },
    ]},
  },
  accountant: {
    icon: "🧮",
    ru: { title: "Бухгалтер", desc: "Выберите раздел:", subs: [
      { id: "acc_salary",         label: "💵 Расчёт зарплаты"        },
      { id: "acc_tax",            label: "🧾 Налоги (НДС, прибыль)"  },
      { id: "acc_balance",        label: "📊 Баланс и отчётность"    },
      { id: "acc_cashflow",       label: "💸 Cash Flow и P&L"        },
      { id: "acc_calc",           label: "🔢 Калькулятор затрат"     },
    ]},
    uz: { title: "Hisobchi", desc: "Bo'limni tanlang:", subs: [
      { id: "acc_salary",         label: "💵 Ish haqi hisoblash"     },
      { id: "acc_tax",            label: "🧾 Soliqlar (QQS, foyda)"  },
      { id: "acc_balance",        label: "📊 Balans va hisobotlar"   },
      { id: "acc_cashflow",       label: "💸 Cash Flow va P&L"       },
      { id: "acc_calc",           label: "🔢 Xarajatlar kalkulyatori" },
    ]},
  },
  time: {
    icon: "⏰",
    ru: { title: "Тайм-менеджмент", desc: "Что планируем?", subs: [
      { id: "time_day",           label: "📅 План дня"               },
      { id: "time_week",          label: "🗓 План недели"             },
      { id: "time_goals",         label: "🎯 Цели и приоритеты"      },
      { id: "time_pomodoro",      label: "🍅 Pomodoro сессия"        },
      { id: "time_habits",        label: "✅ Привычки и дисциплина"  },
    ]},
    uz: { title: "Vaqt menejment", desc: "Nima rejalashtiramiz?", subs: [
      { id: "time_day",           label: "📅 Kun rejasi"             },
      { id: "time_week",          label: "🗓 Hafta rejasi"            },
      { id: "time_goals",         label: "🎯 Maqsadlar va ustuvorliklar" },
      { id: "time_pomodoro",      label: "🍅 Pomodoro sessiyasi"     },
      { id: "time_habits",        label: "✅ Odatlar va intizom"     },
    ]},
  },
};

// Системные промпты для подразделов
const SUBDEPT_PROMPTS = {
  general_strategy:   "Ты эксперт по бизнес-стратегии и управлению. Помогай с бизнес-планами, оргструктурой, KPI, управленческими решениями.",
  general_marketing:  "Ты эксперт по маркетингу. Помогай с маркетинговой стратегией, анализом ЦА, позиционированием, рекламными кампаниями.",
  general_sales:      "Ты эксперт по продажам и переговорам. Помогай с техниками продаж, скриптами, работой с возражениями, CRM.",
  general_startup:    "Ты ментор стартапов. Помогай с MVP, питч-деком, поиском инвесторов, запуском продукта, unit-экономикой.",
  general_hr:         "Ты HR-эксперт. Помогай с наймом, мотивацией, онбордингом, оценкой персонала, корпоративной культурой.",
  brain_product:      "Ты продуктовый стратег. Генерируй идеи новых продуктов и услуг, помогай с Jobs-to-be-done, value proposition.",
  brain_marketing:    "Ты креативный маркетолог. Генерируй нестандартные маркетинговые идеи, акции, коллаборации, вирусный контент.",
  brain_monetize:     "Ты эксперт по монетизации. Генерируй модели монетизации, дополнительные источники дохода, upsell/cross-sell.",
  brain_content:      "Ты контент-стратег. Генерируй идеи для постов, Reels, Stories, YouTube, TikTok, контент-план.",
  brain_innovation:   "Ты инновационный консультант. Генерируй идеи автоматизации, AI-интеграции, технологических улучшений.",
  text_email:         "Ты деловой копирайтер. Пиши профессиональные письма: коммерческие предложения, деловая переписка, follow-up.",
  text_contract:      "Ты юридический копирайтер. Составляй договоры, NDA, акты, протоколы встреч, официальные документы.",
  text_social:        "Ты SMM-копирайтер. Пиши цепляющие посты для Instagram, Telegram, LinkedIn, TikTok с хэштегами и CTA.",
  text_ads:           "Ты рекламный копирайтер. Пиши продающие тексты: объявления, лендинги, заголовки, email-рассылки.",
  text_report:        "Ты бизнес-аналитик и копирайтер. Пиши отчёты, презентации, executive summary, аналитические записки.",
  analyst_marketplace:"Ты эксперт по маркетплейсам (Uzum, Wildberries, Ozon, Amazon). Анализируй ниши, конкурентов, карточки товаров, рейтинги, продажи.",
  analyst_local:      "Ты аналитик локального рынка Узбекистана. Оценивай спрос, конкурентов, цены, тренды местного рынка.",
  analyst_social:     "Ты SMM-аналитик. Анализируй вовлечённость, охваты, конкурентов в соц сетях, рост аудитории, рекламные показатели.",
  analyst_stocks:     "Ты финансовый аналитик фондового рынка. Анализируй акции, P/E, EPS, дивиденды, технический и фундаментальный анализ.",
  analyst_crypto:     "Ты криптовалютный аналитик. Объясняй DeFi, tokenomics, on-chain метрики, технический анализ крипторынка.",
  law_tax:            "Ты налоговый консультант РУз. Объясняй НДС 12%, налог на прибыль 15%, НДФЛ, соц.налог, налог с оборота 4%.",
  law_labor:          "Ты эксперт по трудовому праву РУз. Трудовые договоры, увольнение, отпуска, зарплата, охрана труда по ТК РУз.",
  law_business:       "Ты эксперт по предпринимательскому праву РУз. ИП, ООО, лицензии, регистрация, господдержка бизнеса.",
  law_civil:          "Ты эксперт по гражданскому праву РУз. Договоры, обязательства, собственность, наследство, сроки исковой давности.",
  law_customs:        "Ты эксперт по таможне и ВЭД РУз. Импорт/экспорт, таможенные пошлины, ТН ВЭД коды, валютный контроль.",
  acc_salary:         "Ты бухгалтер по зарплате. Рассчитывай: ИНПС=X*0.001, НДФЛ=(X-ИНПС)*0.12, на руки=X-ИНПС-НДФЛ, соц.налог=X*0.12.",
  acc_tax:            "Ты налоговый бухгалтер РУз. Рассчитывай НДС (12%), налог на прибыль (15%), авансы, декларации.",
  acc_balance:        "Ты финансовый бухгалтер. Составляй баланс, анализируй активы/пассивы, коэффициенты ликвидности.",
  acc_cashflow:       "Ты CFO-консультант. Составляй Cash Flow, P&L, бюджеты, EBITDA, прогнозы движения денег.",
  acc_calc:           "Ты бухгалтер-калькулятор. Считай себестоимость, точку безубыточности, маржинальность, ROI.",
  time_day:           "Ты планировщик дня. Составляй почасовое расписание с Time Blocking, учитывай пики энергии, добавляй буфер 20%.",
  time_week:          "Ты планировщик недели. Распределяй задачи по дням с учётом дедлайнов, энергии и приоритетов.",
  time_goals:         "Ты коуч по целям. Помогай ставить SMART-цели, расставлять приоритеты по матрице Эйзенхауэра, разбивать на шаги.",
  time_pomodoro:      "Ты Pomodoro-тренер. Планируй сессии 25+5 мин, помогай сосредоточиться, убирай отвлекающие факторы.",
  time_habits:        "Ты коуч по привычкам. Помогай формировать полезные привычки, создавать трекеры, применять метод 21 дня.",
};

function showSubDepts(chatId, modeKey) {
  const u   = SUBDEPTS[modeKey];
  const lang = getUser(chatId).lang || "ru";
  const loc  = lang === "uz" ? u.uz : u.ru;
  const msg  = u.icon + " *" + loc.title + "*\n\n" + loc.desc;
  const btns = loc.subs.map(s => [{ text: s.label, callback_data: "sub_" + s.id }]);
  bot.sendMessage(chatId, msg, {
    parse_mode: "Markdown",
    reply_markup: { inline_keyboard: btns },
  });
}

const SUBDEPT_WELCOME = {
  ru: {
    general_strategy:   "📊 *Стратегия и управление*\n\nГотов помочь с бизнес-стратегией, оргструктурой и управленческими решениями. Задайте вопрос!",
    general_marketing:  "📣 *Маркетинг и реклама*\n\nГотов помочь с маркетинговой стратегией, анализом аудитории и рекламными кампаниями. Задайте вопрос!",
    general_sales:      "💰 *Продажи и переговоры*\n\nПомогу со скриптами продаж, работой с возражениями и техниками закрытия сделок. Задайте вопрос!",
    general_startup:    "🚀 *Стартап и запуск*\n\nПомогу с MVP, питч-деком, поиском инвесторов и unit-экономикой. Задайте вопрос!",
    general_hr:         "👥 *HR и команда*\n\nПомогу с наймом, мотивацией персонала и корпоративной культурой. Задайте вопрос!",
    brain_product:      "📦 *Новый продукт / Услуга*\n\nГенерирую идеи продуктов. Опишите вашу нишу или проблему клиента!",
    brain_marketing:    "📢 *Маркетинговые идеи*\n\nГенерирую нестандартные маркетинговые идеи. Расскажите про ваш бизнес!",
    brain_monetize:     "💵 *Монетизация*\n\nПредложу новые источники дохода. Расскажите что у вас есть!",
    brain_content:      "🎬 *Контент и соц сети*\n\nГенерирую идеи для постов и Reels. Какая платформа и тема?",
    brain_innovation:   "⚡ *Инновации и автоматизация*\n\nПредложу идеи по автоматизации и внедрению AI. Что хотите оптимизировать?",
    text_email:         "📧 *Деловые письма*\n\nНапишу профессиональное письмо. Кому пишем и по какому поводу?",
    text_contract:      "📃 *Договоры и документы*\n\nСоставлю договор или документ. Какой тип и между кем?",
    text_social:        "📱 *Посты для соц сетей*\n\nНапишу цепляющий пост. Платформа и тема?",
    text_ads:           "📣 *Реклама и объявления*\n\nНапишу продающий текст. Что рекламируем и для кого?",
    text_report:        "📊 *Отчёты и презентации*\n\nПомогу со структурой и текстом. Что за отчёт и для кого?",
    analyst_marketplace:"🛒 *Маркетплейсы*\n\nАнализирую ниши, конкурентов и карточки товаров на Uzum, Wildberries, Ozon. Задайте вопрос!",
    analyst_local:      "🏪 *Местный рынок*\n\nАнализирую локальный рынок Узбекистана. Задайте вопрос или опишите нишу!",
    analyst_social:     "📊 *Анализ соц сетей*\n\nАнализирую вовлечённость, охваты и конкурентов. Задайте вопрос!",
    analyst_stocks:     "📉 *Фондовый рынок / Акции*\n\nПомогу с анализом акций и рынка. Задайте вопрос!",
    analyst_crypto:     "🪙 *Криптовалюта*\n\nАнализирую крипторынок, DeFi и токеномику. Задайте вопрос!",
    law_tax:            "🧾 *Налоговый кодекс*\n\nОтвечу по НДС, налогу на прибыль, НДФЛ и другим налогам РУз. Задайте вопрос!",
    law_labor:          "👷 *Трудовое право*\n\nОтвечу по трудовым договорам, увольнению, отпускам по ТК РУз. Задайте вопрос!",
    law_business:       "🏢 *Предпринимательство*\n\nОтвечу по регистрации ИП/ООО, лицензиям, господдержке. Задайте вопрос!",
    law_civil:          "📜 *Гражданское право*\n\nОтвечу по договорам, обязательствам, собственности. Задайте вопрос!",
    law_customs:        "🛃 *Таможня и ВЭД*\n\nОтвечу по импорту/экспорту, пошлинам, ТН ВЭД. Задайте вопрос!",
    acc_salary:         "💵 *Расчёт зарплаты*\n\nНазовите сумму оклада — рассчитаю НДФЛ, ИНПС и сумму на руки по формулам.",
    acc_tax:            "🧾 *Налоги*\n\nРассчитаю НДС, налог на прибыль, авансы. Задайте вопрос!",
    acc_balance:        "📊 *Баланс и отчётность*\n\nПомогу с балансом и коэффициентами. Задайте вопрос!",
    acc_cashflow:       "💸 *Cash Flow и P&L*\n\nПомогу составить движение денег и P&L. Задайте вопрос!",
    acc_calc:           "🔢 *Калькулятор затрат*\n\nСчитаю себестоимость, маржу, точку безубыточности. Задайте данные!",
    time_day:           "📅 *План дня*\n\nПеречислите задачи на сегодня — составлю почасовое расписание!",
    time_week:          "🗓 *План недели*\n\nПеречислите задачи и дедлайны — распределю по дням!",
    time_goals:         "🎯 *Цели и приоритеты*\n\nОпишите цели — расставлю приоритеты и разобью на шаги!",
    time_pomodoro:      "🍅 *Pomodoro сессия*\n\nСколько у вас задач? Составлю план Pomodoro-сессий!",
    time_habits:        "✅ *Привычки и дисциплина*\n\nКакую привычку хотите выработать? Помогу с планом и трекером!",
  },
};

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
  const u    = getUser(chatId);
  const lang = u.lang || "ru";
  // Если выбран подраздел — используем его специализированный промпт
  const subPrompt = u.submode && SUBDEPT_PROMPTS[u.submode];
  const baseSys   = getModes(lang)[u.mode || "general"].system;
  const sys       = subPrompt
    ? subPrompt + (lang === "uz" ? " O'zbek tilida javob ber." : " Отвечай на русском языке.")
    : baseSys;
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

// pendingReplies: Map<groupId:@username → { ownerChatId, question, clientName, lang }>
const pendingReplies = new Map();

async function doTag(chatId, req) {
  const t = T(chatId); const u = getUser(chatId);
  if (!u.groupId) return bot.sendMessage(chatId, t.noGroup, { parse_mode:"Markdown", ...kb(chatId) });
  const cl = (u.clients||[]).find(c => c.name.toLowerCase().includes(req.name.toLowerCase()));
  if (!cl)          return bot.sendMessage(chatId, t.tagNF(req.name), { parse_mode:"Markdown", ...kb(chatId) });
  if (!cl.username) return bot.sendMessage(chatId, t.cliNoUser(cl.name), { parse_mode:"Markdown", ...kb(chatId) });
  try {
    const ownerName = u.name || "Директор";
    const groupText = u.lang === "uz"
      ? ownerName + " so'rayapti, " + cl.username + " — " + req.msg
      : "Ваш " + ownerName + " спрашивает, " + cl.username + " — " + req.msg;
    await bot.sendMessage(u.groupId, groupText);

    // Ждём ответа от тегнутого пользователя (24 часа)
    const key = u.groupId + ":" + cl.username.toLowerCase();
    pendingReplies.set(key, { ownerChatId: chatId, question: req.msg, clientName: cl.name, lang: u.lang || "ru" });
    setTimeout(() => pendingReplies.delete(key), 24 * 60 * 60 * 1000);

    bot.sendMessage(chatId, t.tagSent(cl.username, req.msg), { parse_mode:"Markdown", ...kb(chatId) });
  } catch (_) { bot.sendMessage(chatId, t.tagErr, kb(chatId)); }
}

// Слушаем ответы в группах
bot.on("message", (msg) => {
  if (msg.chat.type !== "group" && msg.chat.type !== "supergroup") return;
  if (!msg.text || !msg.from || !msg.from.username) return;

  const key     = String(msg.chat.id) + ":@" + msg.from.username.toLowerCase();
  const pending = pendingReplies.get(key);
  if (!pending) return;

  const text  = msg.text.trim().toLowerCase();
  const YES   = ["да","yes","ha","ok","ок","готово","tayyor","done","сделал","сделала","готов","готова"];
  const NO    = ["нет","no","yo'q","yoq","не готово","ещё нет","hali yo'q","не сделал","не сделала"];
  const isYes = YES.some(w => text === w || text.startsWith(w));
  const isNo  = NO.some(w  => text === w || text.startsWith(w));

  const { ownerChatId, clientName, lang } = pending;

  if (isYes) {
    pendingReplies.delete(key);
    const reply = lang === "uz"
      ? "✅ *" + clientName + "* javob berdi: *Ha*, tayyor!"
      : "✅ *" + clientName + "* ответил(а): *Да*, готово!";
    bot.sendMessage(ownerChatId, reply, { parse_mode: "Markdown" });

  } else if (isNo) {
    pendingReplies.delete(key);
    const reply = lang === "uz"
      ? "❌ *" + clientName + "* javob berdi: *Yo'q*, hali tayyor emas."
      : "❌ *" + clientName + "* ответил(а): *Нет*, ещё не готово.";
    bot.sendMessage(ownerChatId, reply, { parse_mode: "Markdown" });

  } else {
    // Нестандартный ответ — пересылаем владельцу
    const reply = lang === "uz"
      ? "💬 *" + clientName + "* sizdan so'rayapti:\n_\"" + msg.text + "\""
      : "💬 *" + clientName + "* спрашивает у вас:\n_\"" + msg.text + "\""
    bot.sendMessage(ownerChatId, reply, { parse_mode: "Markdown" });
    // pending остаётся — ждём да/нет
  }
});

// ════════════════════════════════════════════════════════════════════════════
//  ГОЛОС
// ════════════════════════════════════════════════════════════════════════════

async function dlFile(fileId, forceExt) {
  const info = await bot.getFile(fileId);
  const url  = "https://api.telegram.org/file/bot" + TELEGRAM_TOKEN + "/" + info.file_path;
  const ext  = forceExt || path.extname(info.file_path) || ".bin";
  const tmp  = path.join("/tmp", "f_" + fileId + ext);
  const r    = await axios({ url, responseType: "arraybuffer" });
  fs.writeFileSync(tmp, r.data);
  return tmp;
}

bot.on("voice", async (msg) => {
  const id = msg.chat.id;
  const t  = T(id);
  const st = await bot.sendMessage(id, t.voiceWait);
  bot.sendChatAction(id, "typing");
  let fp;
  try {
    fp = await dlFile(msg.voice.file_id, ".ogg");
    const lang   = getUser(id).lang === "uz" ? "uz" : "ru";
    const stream = fs.createReadStream(fp);
    stream.path  = "voice.ogg";
    const result = await groq.audio.transcriptions.create({
      file:            stream,
      model:           "whisper-large-v3-turbo",
      language:        lang,
      response_format: "text",
    });
    const recognized = (typeof result === "string" ? result : result.text || "").trim();
    fs.unlink(fp, () => {});
    if (!recognized) {
      return bot.editMessageText(t.voiceErr, { chat_id: id, message_id: st.message_id });
    }
    await bot.editMessageText(
      t.voiceSaid(recognized),
      { chat_id: id, message_id: st.message_id, parse_mode: "Markdown" }
    );
    const tag = parseTag(recognized);
    if (tag) { await bot.deleteMessage(id, st.message_id); return doTag(id, tag); }
    const reply = await ai(id, recognized);
    await bot.deleteMessage(id, st.message_id);
    sendLong(id, "🎤 _" + recognized + "_\n\n" + reply);
  } catch (e) {
    console.error("Voice error:", e.message || e);
    if (fp) fs.unlink(fp, () => {});
    bot.editMessageText(t.voiceErr, { chat_id: id, message_id: st.message_id });
  }
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

  // Выбор подраздела режима
  if (d.startsWith("sub_")) {
    const subId = d.replace("sub_", "");
    const u2    = getUser(id);
    u2.submode  = subId;
    u2.history  = [];
    saveUser(id, u2);
    const lang2   = u2.lang || "ru";
    const welcome = (SUBDEPT_WELCOME[lang2] || SUBDEPT_WELCOME.ru)[subId]
      || (lang2 === "uz" ? "Bo'lim tanlandi. Savol bering!" : "Раздел выбран. Задайте вопрос!");
    bot.sendMessage(id, welcome, { parse_mode: "Markdown", ...kb(id) });
    return;
  }
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
    const greeting = u.lang === "uz"
      ? "Tanishganimdan xursandman, *" + u.name + "*! 👋\n\nMen sizning aqlli yordamchingizman. Rejimni tanlang:"
      : "Приятно познакомиться, *" + u.name + "*! 👋\n\nЯ ваш умный ассистент. Выберите режим работы:";
    bot.sendMessage(id, greeting, { parse_mode:"Markdown", ...kb(id) });
    return;
  }

  // 3. Шаги CRM (только если пользователь сам начал добавление)
  if (waitingCRM.has(id)) { if (await handleCRM(id, text)) return; }

  // 4. Кнопки режимов — показываем подразделы
  const modeKey = t.modeMap[text];
  if (modeKey) {
    u.mode = modeKey; u.submode = null; u.history = []; saveUser(id, u);
    showSubDepts(id, modeKey);
    return;
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
