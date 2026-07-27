const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase & Bot Setup
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

bot.catch((err) => {
  console.error('Grammy error:', err);
});

// Sleep Helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. /start Command
bot.command('start', async (ctx) => {
  const isChannel = !!ctx.message.sender_chat;
  const userId = isChannel ? ctx.message.sender_chat.id : ctx.from.id;
  const username = ctx.from?.username ? `@${ctx.from.username}` : (ctx.from?.first_name || `ID: ${userId}`);

  const sent = await ctx.reply(
    `Welcome ${username}! 🎰 Play Jackpot and earn rewards!\n\nMini 0.05 GRAM, 📢 @Rampage528\n\nSend the Slot Machine emoji to play. Get 777 to win 0.001 GRAM!`
  );

  // ၅ စက္ကန့်ကြာလျှင် စာဖျက်မည်
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

// 3. Slot Machine Dice
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

  // Telegram Animation ရပ်ရန် ၃ စက္ကန့် စောင့်မည်
  await sleep(3000);

  let replyText = '';

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

      replyText = `🎉 Congratulations ${displayName}!\nYou hit 777 Jackpot and received 0.001 GRAM!\nBalance = ${newBalance.toFixed(4)} GRAM💸\n\nMini 0.05 GRAM, 📢 @Rampage528`;
    } catch (error) {
      replyText = `🎉 Congratulations ${displayName}!\nYou hit 777 Jackpot!\n\nMini 0.05 GRAM, 📢 @Rampage528`;
    }
  } else {
    try {
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .single();

      let currentBalance = user ? parseFloat(user.balance || 0) : 0;
      replyText = `❌ Try again ${displayName}! Better luck next time.\nBalance = ${currentBalance.toFixed(4)} GRAM💸\n\nMini 0.05 GRAM, 📢 @Rampage528`;
    } catch (error) {
      replyText = `❌ Try again ${displayName}! Better luck next time.\n\nMini 0.05 GRAM, 📢 @Rampage528`;
    }
  }

  const sentMsg = await ctx.reply(replyText);

  // စာပြန်ပို့ပြီး ၄ စက္ကန့်အကြာတွင် ပြန်ဖျက်မည်
  setTimeout(async () => {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, sentMsg.message_id);
    } catch (e) {}
  }, 4000);
});

// Vercel Express Adapter
const handleWebhook = webhookCallback(bot, 'express');

module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      await handleWebhook(req, res);
    } catch (err) {
      console.error("Webhook processing error:", err);
    }
    return;
  }
  return res.status(200).send('Bot Status: Active');
};
