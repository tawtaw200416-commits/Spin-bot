const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

// Bot Owner ID
const OWNER_ID = 1793453606;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Allowed Chat Cache (Performance မြှင့်ရန်)
const allowedChats = new Set();

// Helper function to handle delays safely
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Slot Machine Rewards Mapping (Micro Units: 1 GRAM = 1,000,000)
const SLOT_REWARDS = {
  64: { reward: 0.001,  units: 1000n, name: '7 7 7' },
  43: { reward: 0.0005, units: 500n,  name: '🍫 🍫 🍫' },
  22: { reward: 0.0003, units: 300n,  name: '🍋 🍋 🍋' },
  1:  { reward: 0.0001, units: 100n,  name: '🍒 🍒 🍒' }
};

// Error Handling
bot.catch((err) => {
  console.error('Error in bot:', err);
});

// Delete message helper safely within serverless context
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {
      // Ignore deletion errors
    }
  })();

  if (ctx.waitUntil) {
    ctx.waitUntil(promise);
  } else if (ctx.state && ctx.state.waitUntil) {
    ctx.state.waitUntil(promise);
  }
};

// Helper: Chat တစ်ခုအား Owner သုံးစွဲခွင့် ပေးထားခြင်း ရှိ/မရှိ စစ်ဆေးခြင်း
const isChatAuthorized = async (chatId, senderId) => {
  // ၁။ စာပို့သူသည် Owner ဖြစ်ပါက အလိုအလျောက် သုံးခွင့်ပေးပြီး Chat ID အား Cache တွင် မှတ်မည်
  if (senderId === OWNER_ID) {
    allowedChats.add(chatId);
    return true;
  }

  // ၂။ Cache ထဲတွင် ရှိနေပြီးသား ဖြစ်ပါက Direct Allow လုပ်မည်
  if (allowedChats.has(chatId)) {
    return true;
  }

  // ၃။ Database မှ Chat အား Owner Activate လုပ်ထားသလား စစ်ဆေးမည်
  try {
    const { data } = await supabase
      .from('authorized_chats')
      .select('chat_id')
      .eq('chat_id', chatId)
      .maybeSingle();

    if (data) {
      allowedChats.add(chatId);
      return true;
    }
  } catch (err) {
    console.error("Auth check error:", err);
  }

  return false;
};

// 1. /start Command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const chatId = ctx.chat.id;

  // Owner ဖြစ်ပါက ဒီ Group/Chat ကို Activated Group အဖြစ် DB မှာ မှတ်ပေးမည်
  if (userId === OWNER_ID) {
    allowedChats.add(chatId);
    try {
      await supabase.from('authorized_chats').upsert({ chat_id: chatId });
    } catch (e) {}
  }

  const authorized = await isChatAuthorized(chatId, userId);
  if (!authorized) return;

  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 💎</code></b></blockquote>\n` +
    `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;

  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });
  deleteMessageLater(ctx, chatId, sent.message_id, 5000);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  const authorized = await isChatAuthorized(ctx.chat.id, ctx.from?.id);
  if (!authorized) return;

  await ctx.replyWithDice('🎰');
});

// 3. Slot Machine Dice Handling (Async Background Processing)
const handleDiceLogic = async (ctx) => {
  if (!ctx.message || !ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const chatId = ctx.chat.id;
  const userId = ctx.from.id;

  // ဝင်ခွင့်ရှိသော Group ဖြစ်ကြောင်း စစ်ဆေးခြင်း
  const authorized = await isChatAuthorized(chatId, userId);
  if (!authorized) return;

  const diceValue = Number(ctx.message.dice.value);
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  // Slot Animation အတွက် ၂.၇ စက္ကန့် စောင့်မည်
  await sleep(2700);

  const winCombination = SLOT_REWARDS[diceValue];
  const rewardUnits = winCombination ? winCombination.units : 0n;

  let finalBalanceFormatted = "0.000000";

  try {
    // ၁။ DB မှ လက်ရှိ Balance ရယူခြင်း
    let { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    let currentUnits = 0n;
    if (user && user.balance) {
      currentUnits = BigInt(Math.round(parseFloat(user.balance) * 1000000));
    }

    // ၂။ တိကျစွာ ပေါင်းခြင်း (Micro Units ဖြင့် တွက်သည့်အတွက် Decimal Error လုံးဝ မရှိပါ)
    if (rewardUnits > 0n) {
      currentUnits += rewardUnits;
    }

    const finalBalanceNum = Number(currentUnits) / 1000000;
    finalBalanceFormatted = finalBalanceNum.toFixed(6);

    // ၃။ DB သို့ ပြန်လည် သိမ်းဆည်းခြင်း
    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: finalBalanceNum
    }, { onConflict: 'telegram_id' });

  } catch (error) {
    console.error("Supabase Transaction Error:", error);
  }

  // Telegram စာပြန်ပို့ရန် ပြင်ဆင်ခြင်း
  let replyText = '';
  if (winCombination) {
    replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
      `<b>You got ${winCombination.name} and received ${winCombination.reward} GRAM!</b>\n` +
      `<blockquote><b>Balance = <code>${finalBalanceFormatted} 💎</code></b></blockquote>\n` +
      `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
  } else {
    replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
      `<blockquote><b>Balance = <code>${finalBalanceFormatted} 💎</code></b></blockquote>\n` +
      `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
  }

  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };
  
  if (ctx.message.message_thread_id) {
    replyOptions.message_thread_id = ctx.message.message_thread_id;
  }

  const sentMsg = await ctx.reply(replyText, replyOptions);
  deleteMessageLater(ctx, chatId, sentMsg.message_id, 5000);
};

// Non-blocking Concurrent Execution
bot.on('message:dice', (ctx) => {
  const promise = handleDiceLogic(ctx);

  if (ctx.waitUntil) {
    ctx.waitUntil(promise);
  } else if (ctx.state && ctx.state.waitUntil) {
    ctx.state.waitUntil(promise);
  }
});

// Vercel Serverless Native Handler
const handleWebhook = webhookCallback(bot, 'std/http');

module.exports = async (req, res, context) => {
  if (req.method === 'POST') {
    try {
      const host = req.headers.host || 'spin-bot-ten.vercel.app';
      const url = `https://${host}${req.url}`;
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

      const response = await handleWebhook(
        new Request(url, {
          method: 'POST',
          headers: req.headers,
          body: rawBody,
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

  return res.status(200).send('Bot Status: Active and Running!');
};
