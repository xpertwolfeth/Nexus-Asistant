// ═══════════════════════════════════════════════════════════
//  uzum-reviews.js — Автоответчик на отзывы Uzum Market
//  Использует Bearer токен из браузерной сессии
// ═══════════════════════════════════════════════════════════

const axios = require("axios");
const Groq  = require("groq-sdk");

const GROQ_KEY      = process.env.GROQ_API_KEY;
const TG_TOKEN      = process.env.TELEGRAM_TOKEN;
const OWNER_CHAT_ID = process.env.OWNER_CHAT_ID;

const groq = new Groq({ apiKey: GROQ_KEY });

// Хранилище токенов и состояния (передаётся из bot.js)
let _getUser, _saveUser, _sendTg;

// ─── Инициализация ─────────────────────────────────────────
function init(getUser, saveUser) {
  _getUser  = getUser;
  _saveUser = saveUser;
}

// ─── Отправить уведомление владельцу ─────────────────────
async function notify(chatId, text) {
  try {
    await axios.post(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
      chat_id: chatId, text, parse_mode: "Markdown",
    });
  } catch (_) {}
}

// ─── Заголовки для запросов ────────────────────────────────
function headers(token) {
  return {
    "Authorization":  `Bearer ${token}`,
    "Accept":         "application/json",
    "Content-Type":   "application/json",
    "Accept-Language":"ru-RU",
    "User-Agent":     "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Origin":         "https://seller.uzum.uz",
    "Referer":        "https://seller.uzum.uz/",
  };
}

// ─── Получить список отзывов без ответа ───────────────────
async function fetchReviews(token, page = 0) {
  const resp = await axios.post(
    `https://api-seller.uzum.uz/api/seller/product-reviews?page=${page}&size=20`,
    { filter: "ALL" },
    { headers: headers(token), timeout: 15000 }
  );
  const all = resp.data?.payload || [];
  // Возвращаем только без ответа
  return all.filter(r => r.replyStatus === null || r.replyStatus === undefined);
}

// ─── Отправить ответ на отзыв ─────────────────────────────
// Официальный эндпоинт найден через F12:
// POST /api/seller/product-reviews/reply/create
// Body: [{"reviewId": 123, "content": "Текст ответа"}]
async function postReply(token, reviewId, replyText) {
  try {
    const resp = await axios.post(
      "https://api-seller.uzum.uz/api/seller/product-reviews/reply/create",
      [{ reviewId: Number(reviewId), content: replyText }],
      { headers: headers(token), timeout: 10000 }
    );
    if (resp.status >= 200 && resp.status < 300) {
      console.log(`✅ Reply sent for review ${reviewId}`);
      return { success: true };
    }
    return { success: false };
  } catch (e) {
    console.error(`❌ postReply error:`, e.response?.status, e.message);
    return { success: false, error: e.response?.status };
  }
}

// ─── AI генерирует ответ ───────────────────────────────────
async function generateReply(review, lang = "ru") {
  const { rating, content, pros, cons, product, customerName } = review;
  const isPositive = rating >= 4;
  const reviewText = [pros, content, cons].filter(Boolean).join(". ") || "(без текста)";
  const productName = product?.productTitle || "товар";
  const name = customerName && customerName !== "Безымянный" ? customerName : null;

  const system = lang === "uz"
    ? `Siz "${productName}" mahsulotini sotuvchi do'kon menejjerisiz. Xaridorning sharhiga javob yozing.
Ohang: ${isPositive ? "do'stona, minnatdor, samimiy" : "muloyim, kechirim so'ragan, muammoni hal qiluvchi"}.
Qoidalar: 2-3 jumla. "Hurmatli xaridor" kabi shablonsiz boshlamang. Emoji ishlatmang. O'zbek tilida.`
    : `Вы менеджер магазина, продающего "${productName}". Напишите ответ на отзыв покупателя.
Тон: ${isPositive ? "дружелюбный, благодарный, искренний" : "вежливый, с извинениями, с конкретным решением"}.
Правила: 2-3 предложения. Не начинайте с "Дорогой покупатель". Без эмодзи. На русском.`;

  const userMsg = `${name ? `Покупатель: ${name}\n` : ""}Рейтинг: ${rating}★\nОтзыв: ${reviewText}`;

  const r = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_tokens: 200,
    messages: [{ role: "system", content: system }, { role: "user", content: userMsg }],
  });
  return r.choices[0].message.content.trim();
}

// ─── Основной цикл проверки отзывов ───────────────────────
// ─── Обработать один отзыв ────────────────────────────────
async function processReview(chatId, token, review, lang) {
  const replyText = await generateReply(review, lang);
  if (review.rating <= 3) {
    await notify(chatId,
      "⚠️ *Негативный отзыв (" + review.rating + "★)*\n\n" +
      "📦 " + (review.product?.productTitle || "Товар").slice(0,50) + "\n" +
      "👤 " + (review.customerName || "Аноним") + "\n" +
      "💬 _" + ([review.pros, review.content, review.cons].filter(Boolean).join(". ").slice(0,200) || "(без текста)") + "_\n\n" +
      "*Предложенный ответ:*\n" + replyText + "\n\n" +
      "Одобрить: `/approve " + review.reviewId + " " + replyText + "`"
    );
    return "pending";
  }
  const result = await postReply(token, review.reviewId, replyText);
  if (result.success) {
    await notify(chatId,
      "✅ *Ответ отправлен (" + review.rating + "★)*\n" +
      "📦 " + (review.product?.productTitle || "Товар").slice(0,40) + "\n" +
      "👤 " + (review.customerName || "Аноним") + "\n" +
      "💬 " + replyText
    );
    return "answered";
  } else {
    await notify(chatId,
      "📝 *Скопируйте ответ вручную:*\n" +
      "📦 " + (review.product?.productTitle || "").slice(0,40) + "\n" +
      "⭐ " + review.rating + "★  ID: `" + review.reviewId + "`\n\n" +
      "_" + replyText + "_"
    );
    return "error";
  }
}

// ─── Основной цикл — ВСЕ страницы включая старые ──────────
async function runReviewCycle(chatId, token, lang) {
  if (!lang) lang = "ru";
  console.log("[Reviews] Starting full cycle (all pages)...");
  let totalAnswered = 0, totalPending = 0, totalErrors = 0;
  let page = 0;

  try {
    while (true) {
      const reviews = await fetchReviews(token, page);
      console.log("[Reviews] Page " + page + ": " + reviews.length + " unanswered");
      if (!reviews.length) break;

      for (const review of reviews) {
        try {
          const status = await processReview(chatId, token, review, lang);
          if (status === "answered") totalAnswered++;
          else if (status === "pending") totalPending++;
          else totalErrors++;
          await new Promise(r => setTimeout(r, 1500));
        } catch (e) {
          console.error("[Reviews] Error review " + review.reviewId + ":", e.message);
          totalErrors++;
        }
      }
      if (reviews.length < 20) break;
      page++;
    }

    const total = totalAnswered + totalPending + totalErrors;
    if (total > 0) {
      await notify(chatId,
        "📊 *Итог проверки отзывов:*\n\n" +
        "✅ Отвечено автоматически: *" + totalAnswered + "*\n" +
        "⚠️ Ждут одобрения: *" + totalPending + "*\n" +
        "❌ Ошибок: *" + totalErrors + "*"
      );
    }
  } catch (e) {
    console.error("[Reviews] Cycle error:", e.response?.status, e.message);
    if (e.response?.status === 401 || e.response?.status === 403) {
      await notify(chatId, "⚠️ *Токен Uzum истёк!*\n\nОбновите: /setuzumtoken НОВЫЙ_ТОКЕН");
    }
  }
}

module.exports = { init, startScheduler, runReviewCycle, approveReply, generateReply, postReply };
