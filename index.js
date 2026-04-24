const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");

async function startBot() {
    // إعداد تخزين الجلسة لضمان بقاء البوت متصلاً
    const { state, saveCreds } = await useMultiFileAuthState('session_data');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        auth: state,
        printQRInTerminal: false,
        // تزييف الهوية لتظهر كمتصفح Chrome رسمي على Windows 10
        // هذا ما سيجعل واتساب يرسل لك "إشعار طلب الربط"
        browser: ["Windows", "Chrome", "122.0.6261.112"] 
    });

    // التحقق إذا كان الحساب غير مسجل للبدء بالربط
    if (!sock.authState.creds.registered) {
        const phoneNumber = "+967781166304"; 
        
        // تأخير 20 ثانية لضمان أن السيرفر مستقر تماماً قبل إرسال الطلب
        setTimeout(async () => {
            try {
                const code = await sock.requestPairingCode(phoneNumber);
                console.log(`\n========================================`);
                console.log(`🚀 كود الربط من متصفح Chrome: ${code}`);
                console.log(`⚠️ أدخل الكود الآن في واتساب ليصلك الإشعار فورا`);
                console.log(`========================================\n`);
            } catch (error) {
                console.log("❌ خطأ: واتساب يرفض الطلبات المتكررة حالياً. يرجى التوقف ساعة.");
            }
        }, 20000);
    }

    sock.ev.on('creds.update', saveCreds);

    // مراقبة الاتصال لإعلامك بنجاح وصول الإشعار والربط
    sock.ev.on('connection.update', (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('\n✅ مبروك! وصل إشعار الربط وتم الاتصال بنجاح.');
        }
    });
}

startBot();
