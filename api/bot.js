const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Spin လှည့်ထားသူများ၏ Slot Result မထုတ်မီ ခလုတ်ခုံ (Pending Spin) များကို ခဏမှတ်ထားမည့် Database/Memory Object
const pendingSpins = new Map();

// Sleep Helper Function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Slot Machine ရလဒ် တွက်ချက်ခြင်း
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

// Error Handling
bot.catch((err) => {
  console.error('Error in bot:', err);
});

// Delay ဖြင့် Background မှာ Message ဖျက်ပေးမည့် Helper Function
const deleteMessageLater = (ctx, chatId, messageId, delay = 10000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {
      console.error('Delete message failed:', e);
    }
  })();

  if (ctx.waitUntil) {
    ctx.waitUntil(promise);
  } else if (ctx.state && ctx.state.waitUntil) {
    ctx.state.waitUntil(promise);
  }
};

// Direct Message Deletion
const deleteMessageDirect = async (chatId, messageId, delay = 10000) => {
  await sleep(delay);
  try {
    await bot.api.deleteMessage(chatId, messageId);
  } catch (e) {
    console.error(`Direct delete message failed for ${messageId}:`, e.message);
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

// 2. Admin Broadcast Command
bot.command('broadcast', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== 1793453606) return ctx.reply('❌ Restricted.');

  const customMessage = ctx.match;
  if (!customMessage) return ctx.reply('⚠️ စာသား ထည့်ပါ။');

  try {
    const { data: users } = await supabase.from('users').select('telegram_id');
    if (!users || users.length === 0) return ctx.reply('❌ User မရှိပါ။');

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
    await ctx.reply(`✅ Broadcast ပြီးပါပြီ!\nအောင်မြင် - ${successCount}\nကျရှုံး - ${failCount}`);
  } catch (err) {
    console.error(err);
  }
});

// ==========================================
// 3. Slot Machine Dice Handling
// ==========================================
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  const threadId = ctx.message.message_thread_id;
  const replyMsg = ctx.message.reply_to_message;

  // Dice Message ကို အရင် ဖျက်မည်
  try {
    await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
  } catch (e) {
    console.error("Error deleting dice:", e.message);
  }

  // Pending Spin အဖြစ် ယာယီသိမ်းထားမည်
  pendingSpins.set(userId, {
    diceValue: diceValue,
    timestamp: Date.now()
  });

  const finalPostId = threadId || (replyMsg ? replyMsg.message_id : ctx.message.message_id);
  let channelUsername = replyMsg?.forward_from_chat?.username || ctx.chat.username;
  let postLink = channelUsername 
    ? `https://t.me/${channelUsername}/${finalPostId}`
    : `https://t.me/c/${ctx.chat.id.toString().replace('-100', '')}/${finalPostId}`;

  // User ထံ Reaction ပေးပြီး Proof ပုံပြန်ပို့ရန် သတိပေးစာ ပို့မည်
  const warningMsg = await ctx.reply(
    `📸 <b>Reaction & Photo Proof Required!</b>\n\n` +
    `Hey ${displayName}, spin မလှည့်မီ Post အား Reaction (❤️ သို့မဟုတ် 👍) ပေးထားသော <b>Screenshot ပုံ</b> ကို Reply ပြန်ပို့ပေးရပါမည်။\n\n` +
    `👉 <a href="${postLink}">Click Here to View Post</a>\n\n` +
    `<i>⚠️ Reaction ပေးထားသည့် ပုံ (Photo) ကို ဤနေရာတွင် Reply ပေးပြီးမှသာ Spin ရလဒ် ထွက်လာပါမည်။</i>`,
    { 
      parse_mode: 'HTML', 
      disable_web_page_preview: true,
      message_thread_id: threadId 
    }
  );

  // စာအိတ်ကို ၁၀ စက္ကန့် (10 seconds) အကြာတွင် auto ဖျက်မည်
  deleteMessageDirect(ctx.chat.id, warningMsg.message_id, 10000);
});

// ==========================================
// 4. User ထံမှ ဓာတ်ပုံ (Photo Proof) ရောက်ရှိလာသည့်အခါ စစ်ဆေးမည်
// ==========================================
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const userId = ctx.from.id;
  const pending = pendingSpins.get(userId);

  // Spin လှည့်ထားခြင်း မရှိပါက (သို့မဟုတ် ၁၀ မိနစ်ထက် ကျော်သွားပါက) လျစ်လျူရှုမည်
  if (!pending) return;

  const diceValue = pending.diceValue;
  pendingSpins.delete(userId); // Pending ထဲမှ ဖျက်မည်

  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;
  const threadId = ctx.message.message_thread_id;

  // Spin ရလဒ် တွက်ချက်ခြင်း
  const winCombination = getSlotResult(diceValue);
  const reward = winCombination ? winCombination.reward : 0;
  let replyText = '';

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
        `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
    } else {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  } catch (error) {
    console.error("Supabase Error:", error);
    replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>`;
  }

  // Spin ရလဒ် ထုတ်ပြန်ပေးမည်
  const sentMsg = await ctx.reply(replyText, { 
    parse_mode: 'HTML', 
    reply_to_message_id: ctx.message.message_id,
    message_thread_id: threadId 
  });

  // ရလဒ်စာသားအား ၅ စက္ကန့်အကြာတွင် ဖျက်မည်
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

  if (req.method === 'GET') {
    try {
      const host = req.headers.host || 'spin-bot-ten.vercel.app';
      const webhookUrl = `https://${host}/api/index`; 
      
      await bot.api.setWebhook(webhookUrl, {
        allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"]
      });
      return res.status(200).send('Webhook configured successfully!');
    } catch (e) {
      return res.status(200).send('Status: Active!');
    }
  }

  return res.status(200).send('Status: Active!');
};
