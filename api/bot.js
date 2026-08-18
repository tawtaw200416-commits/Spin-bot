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
  await ctx.replyWithDice('🎰');
});

// ==========================================
// 3. Admin Broadcast Command
// ==========================================
bot.command('broadcast', async (ctx) => {
  const userId = ctx.from?.id;
  
  if (userId !== 1793453606) {
    return ctx.reply('❌ This command is restricted.');
  }

  const customMessage = ctx.match;
  if (!customMessage) {
    return ctx.reply('⚠️ ကျေးဇူးပြု၍ ပို့လိုသော စာသားကို ထည့်ပါ။\n\n<b>ပုံစံ -</b> <code>/broadcast your_message_here</code>', { parse_mode: 'HTML' });
  }

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('telegram_id');

    if (error || !users || users.length === 0) {
      return ctx.reply('❌ Database မှ User စာရင်းများကို ဆွဲထုတ်၍ မရပါ (သို့) User မရှိပါ။');
    }

    const statusMsg = await ctx.reply(`🚀 User ${users.length} ဦးထံသို့ စတင်ပို့ဆောင်နေပါပြီ...`);

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
      `✅ <b>Broadcast ပြီးစီးပါပြီ!</b>\n\n📤 ပို့ဆောင်နိုင်သူ - ${successCount} ဦးနှင့် ❌ မပို့နိုင်သူ - ${failCount} ဦး`, 
      { parse_mode: 'HTML' }
    );

  } catch (err) {
    console.error("Broadcast Error:", err);
    await ctx.reply('❌ Broadcast လုပ်ရာတွင် အမှားအယွင်း ရှိနေပါသည်။');
  }
});

// ==========================================
// 4. Handle Photo (Proof Verification for Main Post)
// ==========================================
bot.on('message:photo', async (ctx) => {
  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return; // Comment ထဲမှ ပို့မှသာ အလုပ်လုပ်မည်

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  // ပို့လိုက်သော Comment သို့မဟုတ် Reply လုပ်ထားသည့် Main Post ၏ စာသားကို ယူစစ်ဆေးခြင်း
  const repliedMessage = ctx.message.reply_to_message;
  const postCaption = repliedMessage?.text || repliedMessage?.caption || '';

  // Main Post တွင် ပါရမည့် သက်ဆိုင်ရာ သတ်မှတ်စာသား (ဥပမာ - WORLD BEST CRYPTO သို့မဟုတ် လိုအပ်သော Keywords များ)
  // လိုအပ်ပါက မိမိတို့၏ Main Post စာသားအလိုက် ထပ်မံဖြည့်စွက်နိုင်ပါသည်။
  const expectedKeyword = "WORLD BEST CRYPTO"; 
  const hasValidText = postCaption.includes(expectedKeyword) || postCaption.length > 0;

  if (!hasValidText) {
    const errorMsg = `❌ <b>Invalid Post Proof!</b>\n` +
      `တင်ပြထားသော ပုံသည် သက်ဆိုင်ရာ Main Post နှင့် မကိုက်ညီပါ။ ကျေးဇူးပြု၍ မှန်ကန်သော Post တွင် Reaction ပြုလုပ်ထားသည့် ပုံကိုသာ ပြန်လည်တင်ပြပေးပါ။`;
    
    const sentErr = await ctx.reply(errorMsg, {
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    });
    deleteMessageLater(ctx, ctx.chat.id, sentErr.message_id, 8000);
    return;
  }

  try {
    // စာသားနှင့် ပုံမှန်ကန်ပါက Database တွင် Verified = true ဟု မှတ်တမ်းတင်မည်
    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      is_verified: true
    }, { onConflict: 'telegram_id' });

    const replyText = `✅ <b>Post Proof Verified!</b>\n` +
      `Your reaction screenshot for this post is confirmed. You can now roll 🎰 to spin!`;

    const sentMsg = await ctx.reply(replyText, {
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    });
    deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 60000);

  } catch (error) {
    console.error("Verification Error:", error);
    await ctx.reply('❌ Verification လုပ်ဆောင်ရာတွင် အမှားအယွင်းရှိပါသည်၊ ထပ်ကြိုးစားပါ။');
  }
});

// ==========================================
// 5. Slot Machine Dice Handling (With Verification Check)
// ==========================================
bot.on('message:dice', async (ctx) => {
  if (!ctx.message.dice || ctx.message.dice.emoji !== '🎰') return;

  const isComment = ctx.message.reply_to_message || ctx.message.is_topic_message;
  if (!isComment) return;

  const userId = ctx.from.id;
  const rawUsername = ctx.from.username || ctx.from.first_name || `ID: ${userId}`;
  const displayName = ctx.from.username ? `@${ctx.from.username}` : rawUsername;

  try {
    // Database မှ User ၏ Verified ဖြစ်မဖြစ် စစ်ဆေးခြင်း
    let { data: user } = await supabase
      .from('users')
      .select('balance, is_verified')
      .eq('telegram_id', userId)
      .maybeSingle();

    // အကယ်၍ Verify မလုပ်ရသေးပါက (သို့မဟုတ်) Database ထဲ မရှိသေးပါက သတိပေးစာပို့မည်
    if (!user || !user.is_verified) {
      const warningText = `⚠️ <b>Proof Verification Required!</b>\n\n` +
        `Please react (❤️/👍) to the main post and upload the screenshot proof first.\n\n` +
        `🔗 <b>Target Post:</b> <a href="https://t.me/Rampage528">Click Here To View Post</a>`;

      const sentWarning = await ctx.reply(warningText, {
        parse_mode: 'HTML',
        reply_to_message_id: ctx.message.message_id,
        disable_web_page_preview: true
      });
      deleteMessageLater(ctx, ctx.chat.id, sentWarning.message_id, 10000);
      return; 
    }

    // --- Verified ဖြစ်မှသာ Spin လုပ်ငန်းစဥ် ဆက်လုပ်မည် ---
    const diceValue = ctx.message.dice.value;
    let replyText = '';
    const winCombination = getSlotResult(diceValue);
    const reward = winCombination ? winCombination.reward : 0;

    let currentBalance = user && user.balance ? parseFloat(user.balance) : 0;
    let newBalance = currentBalance;

    if (reward > 0) {
      newBalance = Math.round((currentBalance + reward) * 1000000) / 1000000;
    }

    await supabase.from('users').upsert({
      telegram_id: userId,
      username: rawUsername,
      balance: newBalance,
      is_verified: true
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

    const replyOptions = { 
      parse_mode: 'HTML',
      reply_to_message_id: ctx.message.message_id
    };
    
    if (ctx.message.message_thread_id) {
      replyOptions.message_thread_id = ctx.message.message_thread_id;
    }

    const sentMsg = await ctx.reply(replyText, replyOptions);
    deleteMessageLater(ctx, ctx.chat.id, sentMsg.message_id, 5000);

  } catch (error) {
    console.error("Supabase Error:", error);
    const fallbackText = `❌ <b>Try again ${displayName}! Better luck next time.</b>\n` +
      `<b>Mini Withdraw = 0.05 GRAM💰,@Rampage528📢</b>`;
    await ctx.reply(fallbackText, { parse_mode: 'HTML', reply_to_message_id: ctx.message.message_id });
  }
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
