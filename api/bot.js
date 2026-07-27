const { Bot, webhookCallback } = require('grammy');
const { createClient } = require('@supabase/supabase-js');

// သင့် ရဲ့ Supabase URL နှင့် Anon/Public Key အသစ် အပြည့်အစုံ
const SUPABASE_URL = 'https://bysgzzqyubtgvdghldec.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ5c2d6enF5dWJ0Z3ZkZ2hsZGVjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MzM4ODQsImV4cCI6MjA5MzUwOTg4NH0.-4JDl5X--fNYrRyuaOzyUXz0FaJpIxNSLLzcjGrlavQ';
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Telegram Bot Token
const BOT_TOKEN = '8566391789:AAHxMWzB5EERqVAHI7Uf7rQodKzxVbv6SbM';
const bot = new Bot(BOT_TOKEN);

bot.on('message:dice', async (ctx) => {
  // 🎰 Slot Machine မဟုတ်ပါက ကျော်သွားမည်
  if (ctx.message.dice.emoji !== '🎰') return;

  const diceValue = ctx.message.dice.value;
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;

  // Telegram Slot Machine တွင် 64 သည် 777 (Jackpot) ဖြစ်သည်
  if (diceValue === 64) {
    const reward = 0.001;

    try {
      // Supabase မှ လက်ရှိ Balance ကို ရယူခြင်း
      let { data: user } = await supabase
        .from('users')
        .select('balance')
        .eq('telegram_id', userId)
        .single();

      let newBalance = user ? parseFloat(user.balance) + reward : reward;

      // Database တွင် balance ကို သွားရောက် အပ်ဒိတ်လုပ်ခြင်း
      await supabase.from('users').upsert({
        telegram_id: userId,
        username: username,
        balance: newBalance
      });

      await ctx.reply(
        `🎉 ဂုဏ်ယူပါတယ် @${username}! 777 ကျလို့ 0.001 GRAM ရရှိပါသည်။\n💰 လက်ရှိစုစုပေါင်း: ${newBalance.toFixed(3)} GRAM`
      );
    } catch (error) {
      console.error(error);
      await ctx.reply('⚠️ Error ဖြစ်သွားပါသည်၊ ပြန်လည်ကြိုးစားပေးပါ။');
    }
  } else {
    await ctx.reply(`❌ @${username} ရလဒ် 777 မကျပါသဖြင့် 0 GRAM ဖြစ်ပါသည်။`);
  }
});

module.exports = webhookCallback(bot, 'http');
