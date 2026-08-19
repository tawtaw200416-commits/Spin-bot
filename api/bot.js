const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// Supabase Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bncbaexhrofqslsfovow.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'Sb_publishable_i2ZbSs9hDGTOFSYOuhn6kg_dRTyZZC0';
const BOT_TOKEN = process.env.BOT_TOKEN || '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const bot = new Bot(BOT_TOKEN);

// Cooldown Map (Track user's last spin timestamp)
const spinCooldowns = new Map();

// Sleep Helper Function
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Telegram Slot Machine accurate result calculation including 777
const getSlotResult = (value) => {
  let v = value - 1;
  let r1 = v % 4;             
  let r2 = Math.floor(v / 4) % 4; 
  let r3 = Math.floor(v / 16) % 4;

  const symbols = {
    0: { name: '🏷️ BAR BAR BAR', reward: 0.0050 },    // BAR = 0.0050 GRAM
    1: { name: '🍇 🍇 🍇',       reward: 0.00050 },   // Grape = 0.00050 GRAM
    2: { name: '🍋 🍋 🍋',       reward: 0.0010 },   // Lemon = 0.0010 GRAM
    3: { name: '7️⃣ 7️⃣ 7️⃣ (Jackpot)', reward: 0.0100 } // 777 = 0.0100 GRAM
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

// Helper Function to Delete Message Later
const deleteMessageLater = (ctx, chatId, messageId, delay = 2000) => {
  const promise = (async () => {
    await sleep(delay);
    try {
      await bot.api.deleteMessage(chatId, messageId);
    } catch (e) {
      try {
        await ctx.api.deleteMessage(chatId, messageId);
      } catch (err) {
        console.error('Delete message failed:', err);
      }
    }
  })();

  if (ctx.waitUntil) {
    ctx.waitUntil(promise);
  } else if (ctx.state && ctx.state.waitUntil) {
    ctx.state.waitUntil(promise);
  }
};

// Helper to check if message is inside group chat (Allows regular group posts without requiring a reply)
const isCommentSection = (ctx) => {
  const msg = ctx.message;
  if (!msg) return false;
  
  return ctx.chat?.type === 'supergroup' || ctx.chat?.type === 'group';
};

// Target Post ID Extraction Helper
const getTargetPostId = (ctx) => {
  const replyTo = ctx.message?.reply_to_message;
  if (replyTo) {
    return String(replyTo.forward_from_message_id || replyTo.message_id || 'general');
  }
  return String(ctx.message?.message_thread_id || ctx.chat?.id || 'general');
};

const getPostLink = (ctx) => {
  const chatId = ctx.chat?.id;
  const replyTo = ctx.message?.reply_to_message;
  const threadId = replyTo?.message_id || ctx.message?.message_thread_id;
  
  if (chatId && threadId) {
    let cleanChatId = chatId.toString();
    if (cleanChatId.startsWith('-100')) {
      cleanChatId = cleanChatId.substring(4);
    }
    return `https://t.me/c/${cleanChatId}/${threadId}`;
  }
  return `https://t.me/Rampage528`;
};

// 1. /start Command
bot.command('start', async (ctx) => {
  if (!isCommentSection(ctx)) return;

  const userId = ctx.from?.id;
  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 💎</code></b></blockquote>\n` +
    `<b>Mini Withdraw 0.1 GRAM💰,@Rampage528📢</b>`;

  const sent = await ctx.reply(startMessage, { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
    message_thread_id: ctx.message.message_thread_id
  });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 2000);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  if (!isCommentSection(ctx)) return;

  const postLink = getPostLink(ctx);
  const promptText = `⚠️ <b>Proof Verification Required!</b>\n\n` +
    `Please send a screenshot with reaction (❤️ / 👍) given to the post and caption <code>@Rampage528</code> in the group!\n\n` +
    `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`;

  const sent = await ctx.reply(promptText, { 
    parse_mode: 'HTML', 
    disable_web_page_preview: true,
    reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
    message_thread_id: ctx.message.message_thread_id
  });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 2000);
});

// 3. Admin Broadcast Command
bot.command('broadcast', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (userId !== 1793453606) {
    const sent = await ctx.reply('❌ This command is restricted.');
    deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 2000);
    return;
  }

  const customMessage = ctx.match;

  if (!customMessage) {
    const sent = await ctx.reply('⚠️ Please provide a message to broadcast.\n\n<b>Format:</b> <code>/broadcast your_message_here</code>', { parse_mode: 'HTML' });
    deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 2000);
    return;
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('telegram_id');

    if (error || !users || users.length === 0) {
      const sent = await ctx.reply('❌ Failed to retrieve user list from database or no users found.');
      deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 2000);
      return;
    }

    const statusMsg = await ctx.reply(`🚀 Starting broadcast to ${users.length} users...`);

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.telegram_id, customMessage, {
          parse_mode: 'HTML',
          disable_web_page_preview: false
        });
        successCount++;
        await sleep(20); 
      } catch (err) {
        failCount++; 
      }
    }

    await ctx.api.editMessageText(
      ctx.chat.id, 
      statusMsg.message_id, 
      `✅ <b>Broadcast Completed!</b>\n\n📤 Successfully Sent - ${successCount}\n❌ Failed - ${failCount}`, 
      { parse_mode: 'HTML' }
    );
    deleteMessageLater(ctx, ctx.chat.id, statusMsg.message_id, 2000);

  } catch (err) {
    console.error("Broadcast Error:", err);
    const sent = await ctx.reply('❌ An error occurred during broadcast execution.');
    deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 2000);
  }
});

// 4. Photo Verification Handling (Deletes unverified photos immediately)
bot.on('message:photo', async (ctx) => {
  if (!isCommentSection(ctx)) return;

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;
  
  const targetPostIdStr = getTargetPostId(ctx);
  const postLink = getPostLink(ctx);

  const photoCaption = ctx.message.caption || '';
  const isValidCaption = photoCaption.includes('@Rampage528') || photoCaption.includes('game link');

  if (!isValidCaption) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error("Failed to delete unverified photo message:", e);
    }

    const errorMsg = await ctx.reply(
      `❌ <b>Invalid Verification!</b>\n` +
      `Your screenshot was rejected and deleted because the caption is incorrect! Please include caption <code>@Rampage528</code> and reaction (❤️ / 👍).\n\n` +
      `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`,
      { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true,
        reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
        message_thread_id: ctx.message.message_thread_id
      }
    );
    deleteMessageLater(ctx, ctx.chat.id, errorMsg.message_id, 2000);
    return;
  }

  try {
    let { data: existingUser } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    const currentBalance = existingUser && existingUser.balance !== null ? parseFloat(existingUser.balance) : 0;

    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: currentBalance,
      verified_post_id: targetPostIdStr,
      is_verified: true
    }, { onConflict: 'telegram_id' });
  } catch (e) {
    console.error("Supabase verification save error:", e);
  }

  const successMsg = await ctx.reply(
    `✅ <b>Complete Verified User: ${displayName}!</b>\n` +
    `Your screenshot is successfully verified. You can now spin freely here! 🎰`,
    { 
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
      message_thread_id: ctx.message.message_thread_id
    }
  );
  
  deleteMessageLater(ctx, ctx.chat.id, successMsg.message_id, 2000);
});

// 5. Slot Machine Dice Handling (Verification + Custom Cooldown Check)
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;
  if (!isCommentSection(ctx)) return;

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  // ⏱️ ကိုယ်ပိုင် သတ်မှတ်လိုသည့် အချိန် (စက္ကန့်) - လိုသလို ဒီနေရာမှာ ပြင်နိုင်ပါတယ် (ဥပမာ - 2 သို့မဟုတ် 3 စက္ကန့်)
  const slowModeSeconds = 20; 

  // Cooldown Verification Check
  const now = Date.now();
  const lastSpinTime = spinCooldowns.get(userId) || 0;
  const cooldownTime = slowModeSeconds * 1000; // Convert seconds to milliseconds

  if (now - lastSpinTime < cooldownTime) {
    const remainingSeconds = Math.ceil((cooldownTime - (now - lastSpinTime)) / 1000);
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {}

    const cooldownMsg = await ctx.reply(
      `⏳ <b>Slow down ${displayName}!</b>\n` +
      `Please wait <b>${remainingSeconds} seconds</b> before spinning again.`,
      { 
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
        message_thread_id: ctx.message.message_thread_id
      }
    );
    deleteMessageLater(ctx, ctx.chat.id, cooldownMsg.message_id, 2000);
    return;
  }

  // Record current spin timestamp
  spinCooldowns.set(userId, now);

  const currentSpinPostId = getTargetPostId(ctx);
  let isVerifiedForThisPost = false;

  try {
    const { data: userRecord } = await supabase
      .from('users')
      .select('is_verified, verified_post_id, balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    if (userRecord && userRecord.is_verified === true && userRecord.verified_post_id === currentSpinPostId) {
      isVerifiedForThisPost = true;
    }
  } catch (e) {
    console.error("Check verification error:", e);
  }

  if (!isVerifiedForThisPost) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error("Failed to delete unverified spin message:", e);
    }

    const postLink = getPostLink(ctx);
    const warningText = `⚠️ <b>Proof Verification Required!</b>\n\n` +
      `Your spin was deleted because you haven't verified yet! Please send a screenshot with reaction (❤️ / 👍) and caption <code>@Rampage528</code> first!\n\n` +
      `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`;

    const warningMsg = await ctx.reply(warningText, { 
      parse_mode: 'HTML', 
      disable_web_page_preview: true,
      reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
      message_thread_id: ctx.message.message_thread_id
    });

    deleteMessageLater(ctx, ctx.chat.id, warningMsg.message_id, 2000);
    return;
  }

  const diceValue = ctx.message.dice.value;
  let replyText = '';
  const winCombination = getSlotResult(diceValue);
  const reward = winCombination ? winCombination.reward : 0;

  try {
    let { data: user } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    let currentBalance = user && user.balance !== null && user.balance !== undefined ? parseFloat(user.balance) : 0;
    let newBalance = currentBalance;

    if (reward > 0) {
      newBalance = Math.round((currentBalance + reward) * 1000000) / 1000000;
    }

    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: newBalance,
      is_verified: true,
      verified_post_id: currentSpinPostId
    }, { onConflict: 'telegram_id' });

    if (winCombination) {
      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You got ${winCombination.name} and received ${reward} GRAM!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.1 GRAM💰,📢@Rampage528</b>`;
    } else {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.1 GRAM💰,📢@Rampage528</b>`;
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
        `<b>Mini Withdraw = 0.1 GRAM💰,@Rampage528📢</b>`;
    } catch (e) {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<b>Mini Withdraw = 0.1 GRAM💰,@REFERWORLD1📢</b>`;
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
  deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 2000);
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
