const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Sleep Helper Function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper: မူရင်း Post ID ရယူခြင်း
const getPostId = (ctx) => {
  if (ctx.message?.message_thread_id) {
    return String(ctx.message.message_thread_id);
  }
  if (ctx.message?.reply_to_message) {
    return String(ctx.message.reply_to_message.message_id);
  }
  return String(ctx.chat.id);
};

// Slot Machine တွက်ချက်ခြင်း
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

// Error Catching
bot.catch((err) => {
  console.error('Error in bot:', err);
});

// Delay ဖြင့် Message ဖျက်ရန် Helper
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {
      console.error('Delete message failed:', e.message);
    }
  })();

  if (ctx.waitUntil) ctx.waitUntil(promise);
};

const deleteMessageDirect = async (chatId, messageId, delay = 10000) => {
  await sleep(delay);
  try {
    await bot.api.deleteMessage(chatId, messageId);
  } catch (e) {
    console.error(`Direct delete failed:`, e.message);
  }
};

// 1. /start Command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 💎</code></b></blockquote>\n` +
    `<b>Mini Withdraw 0.05 GRAM💰,@Rampage528📢</b>`;

  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  await ctx.replyWithDice('🎰');
});

// 3. Admin Broadcast Command
bot.command('broadcast', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== 1793453606) return ctx.reply('❌ Restricted.');

  const customMessage = ctx.match;
  if (!customMessage) return ctx.reply('⚠️ /broadcast <message>');

  try {
    const { data: users } = await supabase.from('users').select('telegram_id');
    if (!users || users.length === 0) return ctx.reply('❌ User မရှိပါ။');

    const statusMsg = await ctx.reply(`🚀 User ${users.length} ဦးထံ ပို့နေပါပြီ...`);
    let successCount = 0, failCount = 0;

    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.telegram_id, customMessage, { parse_mode: 'HTML' });
        successCount++;
        await sleep(50); 
      } catch (err) {
        failCount++; 
      }
    }

    await ctx.api.editMessageText(
      ctx.chat.id, 
      statusMsg.message_id, 
      `✅ <b>Broadcast ပြီးပါပြီ!</b>\n\n📤 အောင်မြင် - ${successCount}\n❌ မရောက်ပါ - ${failCount}`, 
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    console.error("Broadcast Error:", err);
  }
});

// ==========================================
// 4. PHOTO VALIDATION (ပုံစစ်ဆေးခြင်း နှင့် အသဲ Reaction စစ်ထုတ်ခြင်း)
// ==========================================
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return; 

  const userId = ctx.from.id;
  const postId = getPostId(ctx);
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;
  const threadId = ctx.message.message_thread_id;

  const replyOptions = { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id };
  if (threadId) replyOptions.message_thread_id = threadId;

  try {
    // ပုံပါရှိမရှိ စစ်ဆေးခြင်း
    const photos = ctx.message.photo;
    if (!photos || photos.length === 0) {
      const errSent = await ctx.reply(`⚠️ <b>ပုံမှန်မဟုတ်သော ဖိုင်ဖြစ်နေပါသည်။ ကျေးဇူးပြု၍ Screenshot ပုံမှန် ပို့ပေးပါ။</b>`, replyOptions);
      deleteMessageLater(ctx, ctx.chat.id, errSent.message_id, 5000);
      return;
    }

    // DB တွင် User မှတ်သားမည်
    await supabase.from('users').upsert({ telegram_id: userId, username: rawUsername }, { onConflict: 'telegram_id' });

    // DB တွင် အဆိုပါ Post ID အတွက် Photo Verification True ဟု သတ်မှတ်မည်
    const { error } = await supabase.from('user_proofs').upsert({
      user_id: userId,
      post_id: postId,
      has_photo_proof: true,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id,post_id' });

    if (error) {
      console.error("Supabase Proof Insert Error:", error);
      return;
    }

    // သက်ဆိုင်ရာ Comment ထဲတွင် အကြောင်းကြားစာ ထွက်မည်
    const successMsg = await ctx.reply(
      `✅ <b>Screenshot Proof Verified!</b>\n\n` +
      `ကျေးဇူးတင်ပါတယ် ${displayName}! Post အတွက် Reaction Screenshot စစ်ဆေးပြီးပါပြီ။\n\n` +
      `🎰 <b>ယခု <code>🎰</code> (Spin) ကို ဒီ Comment မှာ ပို့ပြီး လှည့်နိုင်ပါပြီ!</b>`, 
      replyOptions
    );

    deleteMessageLater(ctx, ctx.chat.id, successMsg.message_id, 8000);

  } catch (err) {
    console.error("Photo Verification Error:", err);
  }
});

// ==========================================
// 5. SPIN (DICE) HANDLING & STRICT POST CHECKING
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

  // ----------------------------------------------------
  // ၁။ အဆိုပါ Post အတွက် ပုံ ပို့ထားခြင်း ရှိ/မရှိ DB တွင် စစ်ဆေးမည်
  // ----------------------------------------------------
  let isVerified = false;

  try {
    const { data: proofData } = await supabase
      .from('user_proofs')
      .select('has_photo_proof')
      .eq('user_id', userId)
      .eq('post_id', postId)
      .maybeSingle();

    if (proofData && proofData.has_photo_proof === true) {
      isVerified = true;
    }
  } catch (err) {
    console.error("Proof DB Check Error:", err);
  }

  // ----------------------------------------------------
  // A. ပုံ မပို့ရသေးပါက (Dice ဖျက်မည် + သက်ဆိုင်ရာ Comment တွင် Warning ပြမည်)
  // ----------------------------------------------------
  if (!isVerified) {
    // ၁။ Dice ကို ချက်ချင်း ဖျက်မည်
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error("Failed to delete dice:", e.message);
    }

    // ၂။ သက်ဆိုင်ရာ Post Link ဖန်တီးမည်
    const replyMsg = ctx.message.reply_to_message;
    const finalPostId = threadId || (replyMsg ? replyMsg.message_id : ctx.message.message_id);
    let channelUsername = replyMsg?.forward_from_chat?.username || ctx.chat.username;
    
    let postLink = channelUsername 
      ? `https://t.me/${channelUsername}/${finalPostId}`
      : `https://t.me/c/${ctx.chat.id.toString().replace('-100', '')}/${finalPostId}`;

    const warningOptions = { parse_mode: 'HTML', disable_web_page_preview: true };
    if (threadId) warningOptions.message_thread_id = threadId;

    // ၃။ သက်ဆိုင်ရာ Comment Thread ထဲတွင်သာ Warning စာပြမည်
    const warningMsg = await ctx.reply(
      `❌ <b>Spin လှည့်ခွင့် မရှိသေးပါ!</b>\n\n` +
      `မင်္ဂလာပါ ${displayName}၊ Spin (🎰) မလှည့်မီ သက်ဆိုင်ရာ Post ကို ❤️ (Heart) Reaction ပေးထားကြောင်း <b>Screenshot ပုံကို ဒီ Comment ထဲသို့ အရင် ပို့ပေးပါ!</b>\n\n` +
      `👉 <a href="${postLink}">ဒီနေရာကိုနှိပ်၍ Post ကိုသွားပါ</a>`,
      warningOptions
    );

    // ၄။ Warning Message ကို ၁၀ စက္ကန့်အကြာတွင် ဖျက်မည်
    deleteMessageDirect(ctx.chat.id, warningMsg.message_id, 10000);
    return;
  }

  // ----------------------------------------------------
  // B. ပုံ ပို့ထားပြီးပါက (Proof Reset ပြန်လုပ်မည် + Spin ပေးမည်)
  // ----------------------------------------------------
  // လှည့်ပြီးပါက ဤ Post အတွက် Verified Status ကို Reset ပြန်လုပ်မည် (ထပ်လှည့်လိုပါက ပုံအသစ် ပြန်ပို့ရမည်)
  try {
    await supabase
      .from('user_proofs')
      .update({ has_photo_proof: false })
      .eq('user_id', userId)
      .eq('post_id', postId);
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
    let newBalance = currentBalance;

    if (reward > 0) {
      newBalance = Math.round((currentBalance + reward) * 1000000) / 1000000;
    }

    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: newBalance
    }, { onConflict: 'telegram_id' });

    if (winCombination) {
      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You got ${winCombination.name} and received ${reward} GRAM!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
    } else {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  } catch (error) {
    console.error("Supabase Error:", error);
    replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
      `<b>Mini Withdraw = 0.05 GRAM💰,@Rampage528📢</b>`;
  }

  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };
  
  if (threadId) {
    replyOptions.message_thread_id = threadId;
  }

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
