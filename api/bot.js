const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Sleep Helper Function (Spin ရပ်သည်နှင့် ချက်ချင်းပေါ်စေရန် 1 စက္ကန့်သို့ လျှော့ချထားပါသည်)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Error Handling
bot.catch((err) => {
  console.error('Error in bot:', err);
});

// 1. /start Command
bot.command('start', async (ctx) => {
  const userId = ctx.from?.id;
  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 GRAM</code>💸</b></blockquote>\n` +
    `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;

  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });

  // 5s ကြာလျှင် စာဖျက်မည်
  setTimeout(async () => {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, sent.message_id);
    } catch (e) {}
  }, 5000);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  await ctx.replyWithDice('🎰');
});

// 3. Slot Machine Dice Handling Only
bot.on('message:dice', async (ctx) => {
  // 🎰 Slot Machine မဟုတ်ပါက လုံးဝ စာမပြန်ဘဲ ကျော်မည်
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  
  // User Identification (Channel အကောင့် မပါစေရ)
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  // Spin Animation ရပ်သည်နှင့် စာချက်ချင်းပေါ်စေရန် 1000ms (1 စက္ကန့်) သာ စောင့်မည်
  await sleep(1000);

  let replyText = '';

  // 777 Jackpot (Value = 64)
  if (diceValue === 64) {
    const reward = 0.001;

    try {
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .single();

      let currentBalance = user ? parseFloat(user.balance || 0) : 0;
      let newBalance = currentBalance + reward;

      await supabase.from('users').upsert({
        telegram_id: userId,
        username: rawUsername,
        balance: newBalance
      });

      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You hit 777 Jackpot and received 0.001 GRAM!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(4)} GRAM</code>💸</b></blockquote>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    } catch (error) {
      console.error("Supabase Error:", error);
      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You hit 777 Jackpot!</b>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  } else {
    // 777 မကျပါက (လက်ရှိ Balance ပြသမည်)
    try {
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .single();

      let currentBalance = user ? parseFloat(user.balance || 0) : 0;
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${currentBalance.toFixed(4)} GRAM</code>💸</b></blockquote>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    } catch (error) {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  }

  // စာပြန်ပို့ခြင်း (parse_mode: 'HTML' ဖြင့် အထူနှင့် ဘောင်ပေါ်စေသည်)
  const sentMsg = await ctx.reply(replyText, { parse_mode: 'HTML' });

  // စာပို့ပြီး ၅ စက္ကန့် (5000ms) အကြာတွင် အလိုအလျောက် ပြန်ဖျက်မည်
  setTimeout(async () => {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id);
    } catch (e) {}
  }, 5000);
});

// Vercel Serverless Native Handler (မူလအတိုင်း မပြောင်းလဲပါ)
const handleWebhook = webhookCallback(bot, 'std/http');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const host = req.headers.host || 'spin-bot-ten.vercel.app';
      const url = `https://${host}${req.url}`;
      
      const response = await handleWebhook(
        new Request(url, {
          method: 'POST',
          headers: req.headers,
          body: typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {}),
        })
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
