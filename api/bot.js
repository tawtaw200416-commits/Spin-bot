const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Error Handling
bot.catch((err) => {
  console.error('Error in bot:', err);
});

// 1. /start Command
bot.command('start', async (ctx) => {
  const isChannel = !!ctx.message.sender_chat;
  const userId = isChannel ? ctx.message.sender_chat.id : ctx.from.id;
  const username = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || `ID: ${userId}`);

  await ctx.reply(`Welcome ${username}! 🎰 Play Jackpot and earn rewards!\n\nMini 0.05 GRAM, 📢 @Rampage528\n\nSend the Slot Machine emoji to play. Get 777 to win 0.001 GRAM!`);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  await ctx.replyWithDice('🎰');
});

// 3. Slot Machine Dice Handling
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const diceValue = ctx.message.dice.value;
  const isChannel = !!ctx.message.sender_chat;
  const userId = isChannel ? ctx.message.sender_chat.id : ctx.from.id;
  
  let displayName = '';
  let dbUsername = '';

  if (isChannel) {
    const title = ctx.message.sender_chat.title || `ID: ${userId}`;
    displayName = title.startsWith('@') ? title : `@${title}`;
    dbUsername = title;
  } else {
    if (ctx.from.username) {
      displayName = `@${ctx.from.username}`;
      dbUsername = ctx.from.username;
    } else if (ctx.from.first_name) {
      displayName = ctx.from.first_name;
      dbUsername = ctx.from.first_name;
    } else {
      displayName = `ID: ${userId}`;
      dbUsername = `ID: ${userId}`;
    }
  }

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
        username: dbUsername,
        balance: newBalance
      });

      await ctx.reply(
        `🎉 Congratulations ${displayName}!\nYou hit 777 Jackpot and received 0.001 GRAM!\nBalance = ${newBalance.toFixed(4)} GRAM💸\n\nMini 0.05 GRAM, 📢 @Rampage528`
      );
    } catch (error) {
      console.error("Supabase Error:", error);
      await ctx.reply('⚠️ Database error. Please try again.');
    }
  } else {
    // 777 မကျပါက (လက်ရှိ Balance ကိုပါ ပြသပေးမည်)
    try {
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .single();

      let currentBalance = user ? parseFloat(user.balance || 0) : 0;

      await ctx.reply(
        `❌ Try again ${displayName}! Better luck next time.\nBalance = ${currentBalance.toFixed(4)} GRAM💸\n\nMini 0.05 GRAM, 📢 @Rampage528`
      );
    } catch (error) {
      await ctx.reply(`❌ Try again ${displayName}! Better luck next time.\n\nMini 0.05 GRAM, 📢 @Rampage528`);
    }
  }
});

// Vercel Express Handler
const handleWebhook = webhookCallback(bot, 'express');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await handleWebhook(req, res);
    } catch (err) {
      console.error("Webhook processing error:", err);
      if (!res.headersSent) {
        res.status(200).send('OK');
      }
    }
    return;
  }

  return res.status(200).send('Bot Status: Active and Running!');
};
