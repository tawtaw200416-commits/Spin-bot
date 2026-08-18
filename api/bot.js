const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Store pending spins in memory (User ID -> Spin Details)
const pendingSpins = new Map();

// Sleep Helper Function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Slot Machine Result Calculation
const getSlotResult = (value) => {
  let v = value - 1;
  let r1 = v % 4;             
  let r2 = Math.floor(v / 4) % 4; 
  let r3 = Math.floor(v / 16) % 4;

  const symbols = {
    0: { name: '🏷️ BAR BAR BAR', reward: 0.00080 },
    1: { name: '🍇 🍇 🍇',       reward: 0.00050 },
    2: { name: '🍋 🍋 🍋',       reward: 0.00030 },
    3: { name: '7️⃣ 7️⃣ 7️⃣ (Jackpot)', reward: 0.0010 }
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

// Helper Function to delete messages after delay
const deleteMessageLater = (ctx, chatId, messageId, delay = 10000) => {
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

// Direct Message Deletion
const deleteMessageDirect = async (chatId, messageId, delay = 10000) => {
  await sleep(delay);
  try {
    await bot.api.deleteMessage(chatId, messageId);
  } catch (e) {
    console.error(`Direct delete message failed for ${messageId}:`, e.message);
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
    `<b>Minimum Withdrawal: 0.05 GRAM 💰 | Admin: @Rampage528 📢</b>`;

  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
});

// 2. Admin Broadcast Command
bot.command('broadcast', async (ctx) => {
  const userId = ctx.from?.id;
  if (userId !== 1793453606) return ctx.reply('❌ This command is restricted.');

  const customMessage = ctx.match;
  if (!customMessage) return ctx.reply('⚠️ Please provide a message.\n\n<b>Format:</b> <code>/broadcast your_message</code>', { parse_mode: 'HTML' });

  try {
    const { data: users } = await supabase.from('users').select('telegram_id');
    if (!users || users.length === 0) return ctx.reply('❌ No users found in database.');

    let successCount = 0, failCount = 0;
    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.telegram_id, customMessage, { parse_mode: 'HTML' });
        successCount++;
        await sleep(50);
      } catch (err) {
        failCount++;
      }
    }
    await ctx.reply(`✅ <b>Broadcast Completed!</b>\n\nSuccessful: ${successCount}\nFailed: ${failCount}`, { parse_mode: 'HTML' });
  } catch (err) {
    console.error(err);
  }
});

// ==========================================
// 3. Slot Machine Dice Handling (In specific comment thread)
// ==========================================
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  const threadId = ctx.message.message_thread_id;
  const replyMsg = ctx.message.reply_to_message;

  // Delete original dice message immediately
  try {
    await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
  } catch (e) {
    console.error("Error deleting dice message:", e.message);
  }

  // Save pending spin details for this user
  pendingSpins.set(userId, {
    diceValue: diceValue,
    timestamp: Date.now()
  });

  const finalPostId = threadId || (replyMsg ? replyMsg.message_id : ctx.message.message_id);
  let channelUsername = replyMsg?.forward_from_chat?.username || ctx.chat.username;
  let postLink = channelUsername 
    ? `https://t.me/${channelUsername}/${finalPostId}`
    : `https://t.me/c/${ctx.chat.id.toString().replace('-100', '')}/${finalPostId}`;

  // Build options to reply ONLY in the exact comment thread where user spun
  const warningOptions = { 
    parse_mode: 'HTML',
    disable_web_page_preview: true
  };

  if (threadId) {
    warningOptions.message_thread_id = threadId;
  }
  if (replyMsg) {
    warningOptions.reply_to_message_id = replyMsg.message_id;
  }

  // Send English warning message in the specific comment thread
  const warningMsg = await ctx.reply(
    `📸 <b>Reaction & Photo Proof Required!</b>\n\n` +
    `Hey ${displayName}, before spinning, you must react (❤️ or 👍) to the channel post and send a <b>Screenshot (Photo)</b> as a reply in this comment thread!\n\n` +
    `👉 <a href="${postLink}">Click Here to View Post</a>\n\n` +
    `<i>⚠️ Reply with your screenshot photo in this thread to claim your spin result!</i>`,
    warningOptions
  );

  // Auto delete warning message after 10 seconds
  deleteMessageDirect(ctx.chat.id, warningMsg.message_id, 10000);
});

// ==========================================
// 4. Photo Proof Handling (In specific comment thread)
// ==========================================
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const userId = ctx.from.id;
  const pending = pendingSpins.get(userId);

  // Ignore if user has no active pending spin
  if (!pending) return;

  const diceValue = pending.diceValue;
  pendingSpins.delete(userId); // Remove pending spin

  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;
  const threadId = ctx.message.message_thread_id;

  // Calculate spin result
  const winCombination = getSlotResult(diceValue);
  const reward = winCombination ? winCombination.reward : 0;
  let replyText = '';

  try {
    let { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
    let newBalance = reward > 0 ? Math.round((currentBalance + reward) * 1000000) / 1000000 : currentBalance;

    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: newBalance
    }, { onConflict: 'telegram_id' });

    if (winCombination) {
      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You got ${winCombination.name} and received ${reward} GRAM!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM 💰 | Admin: @Rampage528 📢</b>`;
    } else {
      replyText = `❌ <b>Better luck next time, ${displayName}!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM 💰 | Admin: @Rampage528 📢</b>`;
    }
  } catch (error) {
    console.error("Supabase Error:", error);
    replyText = `❌ <b>Better luck next time, ${displayName}!</b>`;
  }

  // Reply with result in the specific comment thread
  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };

  if (threadId) {
    replyOptions.message_thread_id = threadId;
  }

  const sentMsg = await ctx.reply(replyText, replyOptions);

  // Auto delete result message after 5 seconds
  deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);
});

// Vercel Serverless Webhook Handler
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

  if (req.method === 'GET') {
    try {
      const host = req.headers.host || 'spin-bot-ten.vercel.app';
      const webhookUrl = `https://${host}/api/index`; 
      
      await bot.api.setWebhook(webhookUrl, {
        allowed_updates: ["message", "edited_message", "channel_post", "edited_channel_post"]
      });
      return res.status(200).send('Webhook configured successfully!');
    } catch (e) {
      return res.status(200).send('Status: Active!');
    }
  }

  return res.status(200).send('Status: Active!');
};
