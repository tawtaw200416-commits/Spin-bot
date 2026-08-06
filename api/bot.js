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

// Telegram Slot Machine ၏ 777 အပါအဝင် တရားဝင် ရလဒ်များအားလုံး တိကျစွာ တွက်ချက်သည့် Function
const getSlotResult = (value) => {
  let v = value - 1;
  let r1 = v % 4;             
  let r2 = Math.floor(v / 4) % 4; 
  let r3 = Math.floor(v / 16) % 4;

  const symbols = {
    0: { name: '🏷️ BAR BAR BAR', reward: 0.00200 },    
    1: { name: '🍇 🍇 🍇',       reward: 0.00030 },   
    2: { name: '🍋 🍋 🍋',       reward: 0.00050 },   
    3: { name: '7️⃣ 7️⃣ 7️⃣ (Jackpot)', reward: 0.00300 } 
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
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
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

// 1. /start Command (ပုံမှန်အတိုင်း စာသားဖြင့် ကြိုဆိုရန်)
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

// ==========================================
// 3. Admin (1793453606) သီးသန့် ပုံနှင့် လင့်ခ်ပို့မည့် Command
// ==========================================
bot.command('sendpic', async (ctx) => {
  const userId = ctx.from?.id;
  
  // Admin ID ဟုတ်မဟုတ် စစ်ဆေးခြင်း
  if (userId !== 1793453606) {
    return ctx.reply('❌ This command is restricted.');
  }

  // ⚙️ ပြချင်သော ပုံလိပ်စာ (Image URL)
  const imageUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe'; 

  // ⚙️ ပြချင်သော စာသားနှင့် လင့်ခ်များ
  const captionText = `⚠️ <b>Making New Real Upi Bot (Refer&Earn)</b>\n\n` +
    `💵 <b>Price to add - ₹1k</b>\n\n` +
    `⚠️ <b>Device verification Bot , One Device One time Only✅✅</b>\n\n` +
    `🔗 <a href="https://www.example.com">Website သို့ ဝင်ရန်</a>`;

  await ctx.replyWithPhoto(imageUrl, {
    caption: captionText,
    parse_mode: 'HTML',
    reply_markup: {
      inline_keyboard: [
        [
          { text: '🔗 ဝင်ရောက်ရန် (Website)', url: 'https://www.example.com' }
        ]
      ]
    }
  });
});

// 4. Slot Machine Dice Handling
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  let replyText = '';
  const winCombination = getSlotResult(diceValue);
  const reward = winCombination ? winCombination.reward : 0;

  try {
    let { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
    let newBalance = currentBalance;

    if (reward > 0) {
      newBalance = Math.round((currentBalance + reward) * 1000000) / 1000000;
    }

    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: newBalance
    }, { onConflict: 'telegram_id' });

    if (winCombination) {
      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You got ${winCombination.name} and received ${reward} GRAM!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    } else {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  } catch (error) {
    console.error("Supabase Error:", error);
    try {
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .maybeSingle();
      let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${currentBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    } catch (e) {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<b>Mini 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  }

  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };
  
  if (ctx.message.message_thread_id) {
    replyOptions.message_thread_id = ctx.message.message_thread_id;
  }

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

  return res.status(200).send('Status: Active!');
};
