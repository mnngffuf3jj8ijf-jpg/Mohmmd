const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");
const pino = require("pino");

async function startBot() {
    // إعداد حفظ الجلسة
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        // تغيير هوية المتصفح لتجنب الحظر (بصمة Mac OS)
        browser: ["Mac OS", "Chrome", "110.0.5481.177"] 
    });

    // آلية طلب الكود بتأخير زمني ذكي (15 ثانية) لتجنب خطأ 428
    if (!sock.authState.creds.registered) {
        const phoneNumber = "967781166304"; 
        
        console.log("⏳ انتظر 15 ثانية.. يتم الآن تحضير طلب الكود بشكل آمن...");
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n========================================`);
                console.log(`🔥 كود الربط الجديد: ${code}`);
                console.log(`========================================\n`);
            } catch (error) {
                console.log("❌ فشل في طلب الكود. يرجى الانتظار 10 دقائق قبل إعادة المحاولة.");
            }
        }, 15000); 
    }

    sock.ev.on('creds.update', saveCreds);

    // --- نظام السيطرة والترحيب ---
    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        if (action === 'add') {
            for (let num of participants) {
                await sock.sendMessage(id, { 
                    text: `⚠️ نظام الحماية النشط.\nمرحباً بك @${num.split('@')[0]}.\nأي محاولة تخريب تعني الطرد الفوري.`, 
                    mentions: [num] 
                });
            }
        }
    });

    // --- محرك الفلترة والطرد ---
    sock.ev.on('messages.upsert', async (chat) => {
        const msg = chat.messages[0];
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        const text = msg.message.conversation || msg.message.extendedTextMessage?.text || "";
        const isGroup = from.endsWith('@g.us');

        // الكلمات المحظورة
        const blacklist = ["مسبات", "روابط", "شتم", "قحبه", "منيوك"];
        
        if (isGroup && blacklist.some(word => text.includes(word))) {
            try {
                await sock.sendMessage(from, { delete: msg.key });
                await sock.groupParticipantsUpdate(from, [msg.key.participant], "remove");
                await sock.sendMessage(from, { text: "🛑 تم تنظيف المجموعة من المخربين." });
            } catch (err) {
                console.log("البوت يحتاج صلاحية مشرف للسيطرة.");
            }
        }
    });

    // --- إدارة الاتصال ---
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) startBot();
        } else if (connection === 'open') {
            console.log('✅ السيطرة اكتملت! البوت متصل الآن.');
        }
    });
}

startBot();
