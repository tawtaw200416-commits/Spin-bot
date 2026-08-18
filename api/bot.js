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

// Reliable Helper to get Target Main Post ID from Reply context
const getTargetPostId = (ctx) => {
  const replyTo = ctx.message?.reply_to_message;
  if (replyTo) {
    return replyTo.forward_from_message_id || replyTo.message_id;
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
  const userId = ctx.from?.id;
  const rawUsername = ctx.from?.username || ctx.from?.first_name || `ID: ${userId}`;
  const displayName = ctx.from?.username ? `@${ctx.from.username}` : rawUsername;

  const startMessage = `<b>Welcome ${displayName}! 🎰</b>\n` +
    `<b>Play Jackpot and earn rewards!</b>\n` +
    `<blockquote><b>Balance = <code>0.0000 💎</code></b></blockquote>\n` +
    `<b>Mini Withdraw 0.05 GRAM💰,@Rampage528📢</b>`;

  const sent = await ctx.reply(startMessage, { parse_mode: 'HTML' });
  deleteMessageLater(ctx, ctx.chat.id, sent.message_id, 5000);
});

// 2. /spin Command
bot.command('spin', async (ctx) => {
  const postLink = getPostLink(ctx);
  const promptText = `⚠️ <b>Proof Verification Required!</b>\n\n` +
    `Please send a screenshot with reaction (❤️ / 👍) given to the post and caption <code>WORLD BEST CRYPTO</code> by replying directly to that post!\n\n` +
    `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`;

  const sent = await ctx.reply(promptText, { parse_mode: 'HTML', disable_web_page_preview: true });
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

// 4. Photo Verification Handling (Saves verification status for the specific post)
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  
  // အကယ်၍ comment အပြင်ဘက်မှာ ပို့ရင် ပုံကို တန်းဖျတ်မယ်
  if (!isComment) {
    try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (e) {}
    return;
  }

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;
  
  const targetPostId = getTargetPostId(ctx);
  const targetPostIdStr = targetPostId ? targetPostId.toString() : 'active';

  const photoCaption = ctx.message.caption || '';
  const isValidCaption = photoCaption.includes('WORLD BEST CRYPTO') || photoCaption.includes('game link');

  // Caption မှားရင် ပုံကို တန်းဖျက်မယ်
  if (!isValidCaption) {
    try { await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id); } catch (e) {}
    const errorMsg = await ctx.reply(
      `❌ <b>Invalid Verification!</b>\n` +
      `Your screenshot was rejected because the caption is incorrect! Please include caption <code>WORLD BEST CRYPTO</code> and reaction (❤️ / 👍).`,
      { parse_mode: 'HTML' }
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

    // Supabase ထဲမှာ ဤ User အတွက် Post ID နှင့်အတူ Verified လုပ်ပြီးကြောင်း သိမ်းဆည်းမည်
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
    `✅ <b>Verification Successful, ${displayName}!</b>\n` +
    `Your screenshot is verified. You can now spin freely here!`,
    { 
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    }
  );
  
  deleteMessageLater(ctx, ctx.chat.id, successMsg.message_id, 5000);
});

// 5. Slot Machine Dice Handling (Checks DB verification for the exact post)
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  
  const replyOptions = { 
    parse_mode: 'HTML',
    reply_to_message_id: ctx.message.message_id
  };
  
  if (ctx.message.message_thread_id) {
    replyOptions.message_thread_id = ctx.message.message_thread_id;
  }

  // Comment အပြင်ဘက်မှာ spin ပစ်ရင် Spin ကို တန်းဖျက်မယ်
  if (!isComment) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {}

    const postLink = getPostLink(ctx);
    const warningMsg = await ctx.reply(
      `⚠️ <b>Proof Verification Required!</b>\n\n` +
      `Please send a screenshot with reaction (❤️ / 👍) given to the post and caption <code>WORLD BEST CRYPTO</code> by replying directly inside the target post's comment section to spin!\n\n` +
      `🔗 <b>Target Post:</b> <a href="${postLink}">Click Here To View Post</a>`,
      { parse_mode: 'HTML', disable_web_page_preview: true }
    );
    deleteMessageLater(ctx, ctx.chat.id, warningMsg.message_id, 5000);
    return;
  }

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;
  
  const currentSpinPostId = getTargetPostId(ctx);
  const currentSpinPostIdStr = currentSpinPostId ? currentSpinPostId.toString() : 'active';

  let isVerifiedForThisPost = false;
  try {
    const { data: userRecord } = await supabase
      .from('users')
      .select('is_verified, verified_post_id, balance')
      .eq('telegram_id', userId)
      .maybeSingle();

    // User သည် verified ဖြစ်ပြီး လက်ရှိ post ID နဲ့ ကိုက်ညီမှသာ ခွင့်ပြုမည်
    if (userRecord && userRecord.is_verified === true) {
      if (!userRecord.verified_post_id || userRecord.verified_post_id === currentSpinPostIdStr) {
        isVerifiedForThisPost = true;
      }
    }
  } catch (e) {
    console.error("Check verification error:", e);
  }

  // အကယ်၍ Verify မဖြစ်သေးပါက (သို့မဟုတ် Post အသစ်ဖြစ်နေပါက) Spin ကို တန်းဖျက်မည်
  if (!isVerifiedForThisPost) {
    try {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
    } catch (e) {}

    const postLink = getPostLink(ctx);
    const warningText = `⚠️ <b>Verification Required!</b>\n\n` +
      `Your spin was deleted because you haven't verified for this post yet! Please send a screenshot reply with reaction (❤️ / 👍) and caption <code>WORLD BEST CRYPTO</code> first!\n\n` +
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

  // Verify ဖြစ်ပြီးသားဆိုရင် Spin ကို ဆက်လက်လုပ်ဆောင်ပေးမည်
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
