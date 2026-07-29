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
  const userId = ctx.from?.id;
  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 💎</code></b></blockquote>\n` +
    `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;

  // စာပြန်ပို့ခြင်း (မဖျက်ဘဲ အမြဲတမ်း ကျန်နေပါမည်)
  await ctx.reply(startMessage, { parse_mode: 'HTML' });
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  await ctx.replyWithDice('🎰');
});

// Main async logic handler for dice
const handleDiceLogic = async (ctx) => {
  // 🎰 မဟုတ်ရင် အလုပ်မလုပ်ပါ
  if (!ctx.message || !ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  // Channel Comment, Group, Topic သို့မဟုတ် DM ဟုတ်မဟုတ် တိကျစွာ စစ်ဆေးခြင်း
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

  // Slot Animation ရပ်တန့်သည်အထိ ၂.၇ စက္ကန့် တိတိ စောင့်ပါမည်
  await sleep(2700);

  // အနိုင်ရ/မရ စစ်ဆေးခြင်း (SLOT_REWARDS ထဲမှာ diceValue ရှိမှသာ အနိုင်ရမည်)
  const winCombination = SLOT_REWARDS[diceValue];
  const rewardAmount = winCombination ? Number(winCombination.reward) : 0;

  let finalBalance = 0;

  try {
    // Supabase RPC မ်ားဖြင့် Atomic Update ပြုလုပ်ခြင်း
    const { data, error } = await supabase.rpc('increment_user_balance', {
      p_telegram_id: userId,
      p_username: rawUsername,
      p_amount: rewardAmount
    });

    if (error || data === null) {
      // Fallback logic if RPC fails (မူလ Read & Upsert logic)
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .maybeSingle();

      let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
      if (rewardAmount > 0) {
        currentBalance = Math.round((currentBalance + rewardAmount) * 1000000) / 1000000;
      }
      finalBalance = currentBalance;

      await supabase.from('users').upsert({
        telegram_id: userId,
        username: rawUsername,
        balance: finalBalance
      }, { onConflict: 'telegram_id' });
    } else {
      finalBalance = parseFloat(data || 0);
    }

  } catch (error) {
    console.error("Supabase Transaction Error:", error);
  }

  // Telegram Message တည်ဆောက်ခြင်း
  let replyText = '';

  if (winCombination) {
    // ပေါက်သည့်အကွက်များ (64, 43, 22, 1) ကျမှသာ အောက်ပါ စာသားထွက်မည်
    replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
      `<b>You got ${winCombination.name} and received ${winCombination.reward} GRAM!</b>\n` +
      `<blockquote><b>Balance = <code>${finalBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
      `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
  } else {
    // မပေါက်သည့် အကွက်များ (အကွက် ၆၀ ခန့်) အတွက် ဘာမှ မပေါင်းဘဲ လက်ရှိ Balance ကိုသာ ပြမည်
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

  // စာပြန်ပို့ခြင်း (မဖျက်ဘဲ အမြဲတမ်း ကျန်နေပါမည်)
  await ctx.reply(replyText, replyOptions);
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
const handleWebhook = webhookCallback(bot, 'http');

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
  } else {
    res.status(200).send('Bot Status: Active and Running!');
  }
};
