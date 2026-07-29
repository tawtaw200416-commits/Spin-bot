const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Helper function to handle delays safely
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Slot Machine Rewards Mapping (တန်ဖိုးများကို အမှန်အတိုင်း သေချာပြင်ဆင်ထားသည်)
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
  await ctx.replyWithDice('🎰');
});

// 3. Slot Machine Dice Handling
bot.on('message:dice', async (ctx) => {
  // 🎰 မဟုတ်ရင် အလုပ်မလုပ်ပါ
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  // Channel Comment (Reply) ဟုတ်မဟုတ် စစ်ဆေးခြင်း
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  // Spin လုံးဝ ရပ်သွားသည့် အချိန်အတိအကျ (၁.၈ စက္ကန့်) နှောင့်နှေးပေးခြင်း
  await sleep(1800);

  // အနိုင်ရ/မရ စစ်ဆေးခြင်း
  const winCombination = SLOT_REWARDS[diceValue];
  const rewardAmount = winCombination ? winCombination.reward : 0;

  let finalBalance = 0;

  try {
    // 1. တစ်ဦးချင်းစီ၏ လက်ရှိ User Balance ကို Telegram ID ဖြင့် သီးသန့် ရယူခြင်း
    let { data: user, error: fetchErr } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;

    // 2. ဒဿမကိန်းများ မှားယွင်းပေါင်းခြင်း မရှိစေရန် တိကျစွာ တွက်ချက်ခြင်း
    if (rewardAmount > 0) {
      currentBalance = parseFloat((currentBalance + rewardAmount).toFixed(6));
    }

    finalBalance = currentBalance;

    // 3. User တစ်ဦးချင်းစီအလိုက် Database သို့ Data အသစ် သိမ်းဆည်းခြင်း
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
    replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
      `<b>You got ${winCombination.name} and received ${winCombination.reward} GRAM!</b>\n` +
      `<blockquote><b>Balance = <code>${finalBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
      `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
  } else {
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

  // စာပြန်ပို့ခြင်းနှင့် ခဏအကြာတွင် ဖျက်ခြင်း
  const sentMsg = await ctx.reply(replyText, replyOptions);
  deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
});

// Vercel Serverless Native Handler
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

  return res.status(200).send('Bot Status: Active and Running!');
};
