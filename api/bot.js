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

// Slot Machine Rewards Mapping
const SLOT_REWARDS = {
  64: { reward: 0.001, name: '7 7 7' },
  43: { reward: 0.0003, name: '🍫 🍫 🍫' },
  22: { reward: 0.0002, name: '🍋 🍋 🍋' },
  1:  { reward: 0.0001, name: '🍒 🍒 🍒' }
};

// Error Handling
bot.catch((err) => {
  console.error('Error in bot:', err);
});

// Delay ဖြင့် Background မှာ Message ဖျက်ပေးမည့် Helper Function
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await ctx.api.deleteMessage(chatId, messageId);
    } catch (e) {}
  })();

  // Vercel Serverless Background Execution (If available)
  if (ctx.waitUntil) {
    ctx.waitUntil(promise);
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
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  // Spin Animation ရပ်သည်နှင့် စာချက်ချင်းပေါ်စေရန် 1s စောင့်မည်
  await sleep(1000);

  let replyText = '';
  const winCombination = SLOT_REWARDS[diceValue];

  if (winCombination) {
    // အနိုင်ရရှိသည့် အကွက်ကျပါက
    const reward = winCombination.reward;

    try {
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .single();

      let currentBalance = user ? parseFloat(user.balance || 0) : 0;
      
      // ဒသမ မှန်အောင် ပေါင်းပေးမည့် စာကြောင်း
      let newBalance = Math.round((currentBalance + reward) * 1000000) / 1000000;

      await supabase.from('users').upsert({
        telegram_id: userId,
        username: rawUsername,
        balance: newBalance
      });

      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You got ${winCombination.name} and received ${reward} GRAM!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    } catch (error) {
      console.error("Supabase Error:", error);
      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You got ${winCombination.name}!</b>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  } else {
    // မပေါက်ပါက (လက်ရှိ Balance ပြသမည်)
    try {
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .single();

      let currentBalance = user ? parseFloat(user.balance || 0) : 0;
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${currentBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    } catch (error) {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  }

  // စာပြန်ပို့ခြင်း (parse_mode: 'HTML' ဖြင့် အထူနှင့် ဘောင်ပေါ်စေသည်)
  const sentMsg = await ctx.reply(replyText, { parse_mode: 'HTML' });

  // ၅ စက္ကန့် စောင့်ပြီးမှ Auto Delete လုပ်ရန် Background သို့ လွှဲပေးမည်
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
        context
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
