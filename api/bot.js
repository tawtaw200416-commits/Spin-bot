const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');
const Tesseract = require('tesseract.js');
const fetch = require('node-fetch');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Sleep Helper Function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: Post ID / Thread ID ရယူခြင်း
const getPostId = (ctx) => {
  if (ctx.message?.message_thread_id) {
    return ctx.message.message_thread_id;
  }
  if (ctx.message?.reply_to_message) {
    return ctx.message.reply_to_message.message_thread_id || ctx.message.reply_to_message.message_id;
  }
  return ctx.chat.id;
};

// Helper: Slot Machine Result Calculation
const getSlotResult = (value) => {
  let v = value - 1;
  let r1 = v % 4;             
  let r2 = Math.floor(v / 4) % 4; 
  let r3 = Math.floor(v / 16) % 4;

  const symbols = {
    0: { name: '🏷️ BAR BAR BAR', reward: 0.00080 },
    1: { name: '🍇 🍇 🍇',       reward: 0.00050 },
    2: { name: '🍋 🍋 🍋',       reward: 0.00030 },
    3: { name: '7️⃣ 7️⃣ 7️⃣ (Jackpot)', reward: 0.0010 }
  };

  if (r1 === r2 && r2 === r3) {
    return symbols[r3] || null;
  }

  return null;
};

// Auto Delete Message Helper
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {
      console.error('Delete message failed:', e);
    }
  })();

  if (ctx.waitUntil) ctx.waitUntil(promise);
  else if (ctx.state && ctx.state.waitUntil) ctx.state.waitUntil(promise);
};

const deleteMessageDirect = async (chatId, messageId, delay = 10000) => {
  await sleep(delay);
  try {
    await bot.api.deleteMessage(chatId, messageId);
  } catch (e) {
    console.error(`Direct delete message failed for ${messageId}:`, e.message);
  }
};

// Error Catch
bot.catch((err) => console.error('Error in bot:', err));

// ==========================================
// 1. Photo Proof Analysis (OCR စနစ်ဖြင့် ပုံထဲမှ Reaction စစ်ဆေးခြင်း)
// ==========================================
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const userId = ctx.from.id;
  const postId = getPostId(ctx);
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;
  const threadId = ctx.message.message_thread_id;

  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };
  if (threadId) replyOptions.message_thread_id = threadId;

  try {
    // ဓာတ်ပုံ ပိုင်ဆိုင်ရာ File Path ကို Telegram Server ထံမှ တောင်းယူခြင်း
    const photos = ctx.message.photo;
    const file = await ctx.api.getFile(photos[photos.length - 1].file_id);
    const fileUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${file.file_path}`;

    // OCR Analysis ပြုလုပ်ခြင်း
    const { data: { text } } = await Tesseract.recognize(fileUrl, 'eng');
    
    // ပုံထဲတွင် Reaction ၊ Like ၊ Heart ၊ သို့မဟုတ် အီမိုဂျီ သင်္ကေတများ ပါမပါ စစ်ဆေးခြင်း
    const cleanText = text.toLowerCase();
    const hasReactionKeywords = cleanText.includes('reaction') || 
                                cleanText.includes('comment') || 
                                cleanText.includes('like') ||
                                cleanText.includes('1') || cleanText.includes('2') || cleanText.includes('3'); // Reaction counts

    // OCR စစ်ဆေးချက် အောင်မြင်ပါက DB တွင် Confirm လုပ်ပေးမည်
    if (hasReactionKeywords) {
      await supabase.from('user_proofs').upsert({
        user_id: userId,
        post_id: String(postId),
        has_photo_proof: true,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,post_id' });

      const sentMsg = await ctx.reply(
        `✅ <b>Reaction Screenshot Verified!</b>\n\n` +
        `Thank you ${displayName}! Your reaction proof for this post is verified. You can now send 🎰 to spin!`, 
        replyOptions
      );
      deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
    } else {
      // Reaction မပါပါက ငြင်းပယ်မည်
      const sentMsg = await ctx.reply(
        `❌ <b>Invalid Screenshot!</b>\n\n` +
        `Hey ${displayName}, the uploaded photo does not clearly show your reaction (❤️ or 👍) on the post. Please reply with a valid reaction screenshot!`, 
        replyOptions
      );
      deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 7000);
    }
  } catch (err) {
    console.error("OCR Check Error:", err);
    // OCR Fail ခဲ့လျှင်လည်း ပုံစံတူ အရေးပေါ် အလုပ်လုပ်နိုင်ရန် Default အသုံးပြုခွင့်ပေးခြင်း
    await supabase.from('user_proofs').upsert({
      user_id: userId,
      post_id: String(postId),
      has_photo_proof: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,post_id' });
  }
});

// ==========================================
// 2. Slot Machine Dice Handling & Post-ID Verification
// ==========================================
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  const postId = getPostId(ctx);
  
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  const threadId = ctx.message.message_thread_id;
  const replyMsg = ctx.message.reply_to_message;

  // ----------------------------------------------------
  // လှည့်လိုက်သော POST ID အတွက် သီးသန့် Verification ရှိမရှိ စစ်ဆေးခြင်း
  // ----------------------------------------------------
  let isVerified = false;

  try {
    const { data: proofData } = await supabase
      .from('user_proofs')
      .select('has_photo_proof')
      .eq('user_id', userId)
      .eq('post_id', String(postId))
      .eq('has_photo_proof', true)
      .maybeSingle();

    if (proofData && proofData.has_photo_proof) {
      isVerified = true;
    }
  } catch (err) {
    console.error("Proof DB Check Error:", err);
  }

  // ----------------------------------------------------
  // A. IF NOT VERIFIED FOR THIS SPECIFIC POST
  // ----------------------------------------------------
  if (!isVerified) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error("Error deleting dice:", e.message);
    }

    const finalPostId = threadId || (replyMsg ? replyMsg.message_id : ctx.message.message_id);
    let channelUsername = replyMsg?.forward_from_chat?.username || ctx.chat.username;
    let postLink = channelUsername 
      ? `https://t.me/${channelUsername}/${finalPostId}`
      : `https://t.me/c/${ctx.chat.id.toString().replace('-100', '')}/${finalPostId}`;

    const warningOptions = { 
      parse_mode: 'HTML',
      disable_web_page_preview: true
    };
    if (threadId) warningOptions.message_thread_id = threadId;
    if (replyMsg) warningOptions.reply_to_message_id = replyMsg.message_id;

    const warningMsg = await ctx.reply(
      `⚠️ <b>Access Denied!</b>\n\n` +
      `Hey ${displayName}, you must react (❤️ or 👍) to this channel post and send a valid <b>Screenshot Photo</b> in this comment thread before spinning!\n\n` +
      `👉 <a href="${postLink}">Click Here to View Post & React</a>`,
      warningOptions
    );

    deleteMessageDirect(ctx.chat.id, warningMsg.message_id, 10000);
    return;
  }

  // ----------------------------------------------------
  // B. IF VERIFIED FOR THIS POST (Spin & Reward)
  // ----------------------------------------------------
  // တစ်ကြိမ် spin ပြီးပါက အဆိုပါ Post အတွက် Proof ကို ပြန်ဖျက်မည်
  try {
    await supabase.from('user_proofs').update({ has_photo_proof: false }).eq('user_id', userId).eq('post_id', String(postId));
  } catch (err) {
    console.error("Reset proof error:", err);
  }

  let replyText = '';
  const winCombination = getSlotResult(diceValue);
  const reward = winCombination ? winCombination.reward : 0;

  try {
    let { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
    let newBalance = reward > 0 ? Math.round((currentBalance + reward) * 1000000) / 1000000 : currentBalance;

    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: newBalance
    }, { onConflict: 'telegram_id' });

    if (winCombination) {
      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You got ${winCombination.name} and received ${reward} GRAM!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM 💰 | Admin: @Rampage528 📢</b>`;
    } else {
      replyText = `❌ <b>Better luck next time, ${displayName}!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM 💰 | Admin: @Rampage528 📢</b>`;
    }
  } catch (error) {
    console.error("Supabase Error:", error);
    replyText = `❌ <b>Better luck next time, ${displayName}!</b>`;
  }

  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };
  if (threadId) replyOptions.message_thread_id = threadId;

  const sentMsg = await ctx.reply(replyText, replyOptions);
  deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
});

// Vercel Serverless Webhook Handler
const handleWebhook = webhookCallback(bot, 'std/http');

module.exports = async (req, res, context) => {
  if (req.method === 'POST') {
    try {
      const host = req.headers.host || 'spin-bot-ten.vercel.app';
      const url = `https://${host}${req.url}`;
      
      const response = await handleWebhook(
        new Request(url, {
          method: 'POST',
          headers: req.headers,
          body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
        }),
        context && context.waitUntil ? context.waitUntil.bind(context) : undefined
      );

      res.status(response.status);
      const text = await response.text();
      return res.send(text);
    } catch (err) {
      console.error("Webhook processing error:", err);
      return res.status(200).send('OK');
    }
  }

  return res.status(200).send('Status: Active!');
};
