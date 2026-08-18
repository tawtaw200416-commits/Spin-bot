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

// Telegram Slot Machine Result Calculation
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

// Helper Function to Delete Message Later
const deleteMessageLater = (ctx, chatId, messageId, delay = 5000) => {
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

// Helper to check if the message is strictly inside a channel linked discussion group / supergroup comment thread
const isCommentSection = (ctx) => {
  const msg = ctx.message;
  if (!msg) return false;
  
  const isReply = !!msg.reply_to_message;
  const isTopic = !!msg.is_topic_message;
  const isAutoForward = !!msg.is_automatic_forward;

  return isReply || isTopic || isAutoForward;
};

// Reliable Helper to get Target Main Post ID from Reply context
const getTargetPostId = (ctx) => {
  const replyTo = ctx.message?.reply_to_message;
  if (replyTo) {
    return replyTo.forward_from_message_id || replyTo.message_id || replyTo.reply_to_message?.message_id || null;
  }
  return ctx.message?.message_thread_id || null;
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
    `<b>Mini Withdraw 0.05 GRAM💰,@Rampage528📢</b>`;

  const sent = await ctx.reply(startMessage, { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
    message_thread_id: ctx.message.message_thread_id
  });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  if (!isCommentSection(ctx)) return;

  const postLink = getPostLink(ctx);
  const promptText = `⚠️ <b>Proof Verification Required!</b>\n\n` +
    `Please send a screenshot with reaction (❤️ / 👍) given to the post and caption <code>WORLD BEST CRYPTO</code> by replying directly to that post!\n\n` +
    `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`;

  const sent = await ctx.reply(promptText, { 
    parse_mode: 'HTML', 
    disable_web_page_preview: true,
    reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
    message_thread_id: ctx.message.message_thread_id
  });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
});

// 3. Admin Broadcast Command
bot.command('broadcast', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (userId !== 1793453606) {
    const sent = await ctx.reply('❌ This command is restricted.');
    deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
    return;
  }

  const customMessage = ctx.match;

  if (!customMessage) {
    const sent = await ctx.reply('⚠️ Please provide a message.\n\n<b>Format:</b> <code>/broadcast your_message_here</code>', { parse_mode: 'HTML' });
    deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
    return;
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('telegram_id');

    if (error || !users || users.length === 0) {
      const sent = await ctx.reply('❌ No users found in database.');
      deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
      return;
    }

    const statusMsg = await ctx.reply(`🚀 Broadcasting to ${users.length} users...`);

    let successCount = 0;
    let failCount = 0;

    for (const user of users) {
      try {
        await ctx.api.sendMessage(user.telegram_id, customMessage, {
          parse_mode: 'HTML',
          disable_web_page_preview: false
        });
        successCount++;
        await sleep(50); 
      } catch (err) {
        failCount++; 
      }
    }

    await ctx.api.editMessageText(
      ctx.chat.id, 
      statusMsg.message_id, 
      `✅ <b>Broadcast Completed!</b>\n\n📤 Success - ${successCount}\n❌ Failed - ${failCount}`, 
      { parse_mode: 'HTML' }
    );
    deleteMessageLater(ctx, ctx.chat.id, statusMsg.message_id, 5000);

  } catch (err) {
    console.error("Broadcast Error:", err);
    const sent = await ctx.reply('❌ Error occurred during broadcast.');
    deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
  }
});

// 4. Photo Verification Handling
bot.on('message:photo', async (ctx) => {
  if (!isCommentSection(ctx)) return;

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;
  
  const targetPostId = getTargetPostId(ctx);
  const targetPostIdStr = targetPostId ? String(targetPostId) : 'active';
  const postLink = getPostLink(ctx);

  const photoCaption = ctx.message.caption || '';
  const isValidCaption = photoCaption.includes('WORLD BEST CRYPTO') || photoCaption.includes('game link');

  if (!isValidCaption) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {}

    const errorMsg = await ctx.reply(
      `❌ <b>Invalid Verification!</b>\n` +
      `Your screenshot was rejected because the caption is incorrect! Please include caption <code>WORLD BEST CRYPTO</code> and reaction (❤️ / 👍).\n\n` +
      `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`,
      { 
        parse_mode: 'HTML', 
        disable_web_page_preview: true,
        reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
        message_thread_id: ctx.message.message_thread_id
      }
    );
    deleteMessageLater(ctx, ctx.chat.id, errorMsg.message_id, 5000);
    return;
  }

  try {
    let { data: existingUser } = await supabase
      .from('users')
      .select('balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    const currentBalance = existingUser && existingUser.balance !== null ? parseFloat(existingUser.balance) : 0;

    // Database တွင် သက်ဆိုင်ရာ post ID နှင့်တကွ မှတ်သားသိမ်းဆည်းမည်
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

  // Verify အောင်မြင်ကြောင်းစာသား (Post Link လုံးဝမပါဝင်တော့ပါ)
  const successMsg = await ctx.reply(
    `✅ <b>Complete Verified User: ${displayName}!</b>\n` +
    `Your screenshot is successfully verified. You can now spin freely in this post thread without restriction! 🎰`,
    { 
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
      message_thread_id: ctx.message.message_thread_id
    }
  );
  
  deleteMessageLater(ctx, ctx.chat.id, successMsg.message_id, 5000);
});

// 5. Slot Machine Dice Handling
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;
  if (!isCommentSection(ctx)) return;

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  const currentSpinPostId = getTargetPostId(ctx);
  const currentSpinPostIdStr = currentSpinPostId ? String(currentSpinPostId) : 'active';

  let isVerifiedForThisPost = false;

  try {
    const { data: userRecord } = await supabase
      .from('users')
      .select('is_verified, verified_post_id, balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    // User သည် verify ပြီးသားဖြစ်ပါက Post ID တိုက်စစ်စရာမလိုဘဲ အမြဲတမ်း spin လှည့်ခွင့်ပေးမည် (ဖျက်မည်မဟုတ်ပါ)
    if (userRecord && userRecord.is_verified === true) {
      isVerifiedForThisPost = true;
    }
  } catch (e) {
    console.error("Check verification error:", e);
  }

  // လုံးဝမ verify ရသေးမှသာ spin ကိုဖျက်ပြီး ပုံပို့ရန် တောင်းဆိုမည်
  if (!isVerifiedForThisPost) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {
      console.error("Failed to delete unverified spin message:", e);
    }

    const postLink = getPostLink(ctx);
    const warningText = `⚠️ <b>Proof Verification Required!</b>\n\n` +
      `Your spin was deleted because you haven't verified yet! Please send a screenshot reply with reaction (❤️ / 👍) and caption <code>WORLD BEST CRYPTO</code> first!\n\n` +
      `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`;

    const warningMsg = await ctx.reply(warningText, { 
      parse_mode: 'HTML', 
      disable_web_page_preview: true,
      reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
      message_thread_id: ctx.message.message_thread_id
    });

    deleteMessageLater(ctx, ctx.chat.id, warningMsg.message_id, 5000);
    return;
  }

  // Verify ပြီးသားဖြစ်ပါက spin ကို မဖျက်ဘဲ ဆက်လက်ကစားခွင့်ပေးမည်
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
      verified_post_id: currentSpinPostIdStr
    }, { onConflict: 'telegram_id' });

    if (winCombination) {
      replyText = `🎉 <b>Congratulations ${displayName}!</b>\n` +
        `<b>You got ${winCombination.name} and received ${reward} GRAM!</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
    } else {
      replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
        `<blockquote><b>Balance = <code>${newBalance.toFixed(6)} 💎</code></b></blockquote>\n` +
        `<b>Mini Withdraw = 0.05 GRAM💰,📢@Rampage528</b>`;
    }
  } catch (error) {
    console.error("Supabase Error:", error);
    replyText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
      `<b>Mini Withdraw = 0.05 GRAM💰,@Rampage528📢</b>`;
  }

  const sentMsg = await ctx.reply(replyText, { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.reply_to_message ? ctx.message.reply_to_message.message_id : undefined,
    message_thread_id: ctx.message.message_thread_id
  });
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
