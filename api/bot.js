const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

// Owner ID Configuration
const OWNER_ID = 1793453606;

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Helper function to handle delays safely
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Slot Machine Rewards Mapping
const SLOT_REWARDS = {
  64: { reward: 0.001,  name: '7 7 7' },
  43: { reward: 0.0005, name: '🍫 🍫 🍫' },
  22: { reward: 0.0003, name: '🍋 🍋 🍋' },
  1:  { reward: 0.0001, name: '🍒 🍒 🍒' }
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
      // Ignore deletion errors (e.g. message already deleted or missing perms)
    }
  })();

  if (ctx.waitUntil) {
    ctx.waitUntil(promise);
  } else if (ctx.state && ctx.state.waitUntil) {
    ctx.state.waitUntil(promise);
  }
};

// 1. /start Command
bot.command('start', async (ctx) => {
  // Owner ID စစ်ဆေးခြင်း
  if (ctx.from?.id !== OWNER_ID) {
    const unauthorizedMsg = await ctx.reply("❌ **Access Denied!** This bot is restricted to the owner only.");
    deleteMessageLater(ctx, ctx.chat.id, unauthorizedMsg.message_id, 5000);
    return;
  }

  const userId = ctx.from?.id;
  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 💎</code></b></blockquote>\n` +
    `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;

  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  if (ctx.from?.id !== OWNER_ID) return;
  await ctx.replyWithDice('🎰');
});

// Main async logic handler for dice (Async Non-blocking for high traffic)
const handleDiceLogic = async (ctx) => {
  // Owner စစ်ဆေးခြင်း
  if (ctx.from?.id !== OWNER_ID) return;

  // 🎰 မဟုတ်ရင် အလုပ်မလုပ်ပါ
  if (!ctx.message || !ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  // Channel Comment (Reply), Topic သို့မဟုတ် DM စစ်ဆေးခြင်း
  const isComment = ctx.message.reply_to_message || 
                    ctx.message.is_topic_message || 
                    ctx.message.message_thread_id || 
                    ctx.chat.type === 'supergroup' || 
                    ctx.chat.type === 'group' || 
                    ctx.chat.type === 'private';
                    
  if (!isComment) return;

  const diceValue = Number(ctx.message.dice.value);
  const userId = ctx.from.id;
  
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  // Slot Animation ရပ်တန့်သည်အထိ ၂.၇ စက္ကန့် စောင့်ပါမည်
  await sleep(2700);

  // အနိုင်ရ/မရ စစ်ဆေးခြင်း (SLOT_REWARDS ထဲမှာ diceValue ရှိမှသာ အနိုင်ရမည်)
  const winCombination = SLOT_REWARDS[diceValue];
  const rewardAmount = winCombination ? Number(winCombination.reward) : 0;

  let finalBalance = 0;

  try {
    // 1. လက်ရှိ User ၏ Balance ကို ရယူခြင်း
    let { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;

    // 2. ဒဿမ တိကျစွာ ပေါင်းခြင်း (Precision Fixed To 6 Decimals)
    if (rewardAmount > 0) {
      currentBalance = Math.round((currentBalance + rewardAmount) * 1000000) / 1000000;
    }

    finalBalance = currentBalance;

    // 3. Database သို့ Data အသစ် သိမ်းဆည်းခြင်း
    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: finalBalance
    }, { onConflict: 'telegram_id' });

  } catch (error) {
    console.error("Supabase Transaction Error:", error);
  }

  // Telegram Message တည်ဆောက်ခြင်း
  let replyText = '';

  if (winCombination) {
    // ပေါက်သည့်အကွက်များ (64, 43, 22, 1) ကျမှသာ ထွက်မည်
    replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
      `<b>You got ${winCombination.name} and received ${winCombination.reward} GRAM!</b>\n` +
      `<blockquote><b>Balance = <code>${finalBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
      `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
  } else {
    // မပေါက်သည့် အကွက်များ အတွက်
    replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
      `<blockquote><b>Balance = <code>${finalBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
      `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
  }

  // Reply Options
  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };
  
  if (ctx.message.message_thread_id) {
    replyOptions.message_thread_id = ctx.message.message_thread_id;
  }

  // စာပြန်ပို့ခြင်းနှင့် ၅ စက္ကန့်အကြာတွင် ဖျက်ခြင်း
  const sentMsg = await ctx.reply(replyText, replyOptions);
  deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
};

// 3. Slot Machine Dice Handling (Non-blocking background execution)
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
