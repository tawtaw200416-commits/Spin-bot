const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';

// Telegram Bot Token
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// 1. /start Command (English Response)
bot.command('start', async (ctx) => {
  const username = ctx.from.username || ctx.from.first_name;
  await ctx.reply(`Welcome ${username}! 🎰 Play Jackpot and earn rewards!\nSend or spin the Slot Machine emoji. Get 777 to win GRAM!`);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  await ctx.replyWithDice('🎰');
});

// 3. Slot Machine Dice Handler (English Responses)
bot.on('message:dice', async (ctx) => {
  if (ctx.message.dice.emoji !== '🎰') return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;

  if (diceValue === 64) {
    const reward = 0.001;

    try {
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .single();

      let newBalance = user ? parseFloat(user.balance) + reward : reward;

      await supabase.from('users').upsert({
        telegram_id: userId,
        username: username,
        balance: newBalance
      });

      await ctx.reply(
        `🎉 Congratulations @${username}! You hit 777 Jackpot and won 0.001 GRAM!\n💰 Total Balance: ${newBalance.toFixed(3)} GRAM`
      );
    } catch (error) {
      console.error("Supabase Error:", error);
      await ctx.reply('⚠️ Something went wrong. Please try again.');
    }
  } else {
    await ctx.reply(`❌ @${username}, you missed the 777 Jackpot! (0 GRAM)`);
  }
});

// Vercel Serverless Function Native Handler
const handleWebhook = webhookCallback(bot, 'std/http');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      const url = `https://${req.headers.host}${req.url}`;
      const response = await handleWebhook(
        new Request(url, {
          method: 'POST',
          headers: req.headers,
          body: JSON.stringify(req.body),
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
