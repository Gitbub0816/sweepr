/**
 * Lightweight email translation helper for the API layer.
 * Only contains keys used in outbound customer emails.
 * Falls back to "en" for any missing key or unknown language.
 */

export type LangCode = "en" | "es" | "vi" | "zh-Hans" | "zh-Hant" | "fil" | "ko" | "ar" | "pt" | "hi";

const TRANSLATIONS: Record<LangCode, Record<string, string>> = {
  en: {
    "newsletter.confirm.subject": "You're subscribed to Sweepr updates",
    "newsletter.confirm.body": "Thanks for subscribing! You're now on the Sweepr updates list. We'll keep you posted on new features, service areas, and announcements.",
    "cityUpdates.subject": "We'll let you know when Sweepr comes to your area",
    "cityUpdates.body": "You're on our list! As soon as Sweepr launches in your area, you'll be the first to know.",
    "waitlist.subject": "You're on the Sweepr waitlist!",
    "waitlist.body.customer": "Great news — you're on the list! We're expanding quickly and will reach out as soon as Sweepr is available near you.",
    "waitlist.body.cleaner": "Thanks for your interest in cleaning with Sweepr! We'll be in touch as soon as we're accepting new cleaners in your area.",
    "booking.confirmed.subject": "Your Sweepr booking is confirmed",
    "booking.confirmed.body":
      "Your payment was received and your clean is booked. We'll match you with a top-rated cleaner shortly.",
    "payment.failed.subject": "Payment failed — action needed",
    "payment.failed.body":
      "We couldn't process your payment. Please update your payment method to confirm your booking.",
    "refund.subject": "Your Sweepr refund has been processed",
    "refund.body":
      "Your refund for booking {bookingId} has been processed and will appear on your statement within 5–10 business days.",
  },
  es: {
    "newsletter.confirm.subject": "Estás suscrito a las actualizaciones de Sweepr",
    "newsletter.confirm.body": "¡Gracias por suscribirte! Ya estás en la lista de actualizaciones de Sweepr. Te mantendremos informado sobre nuevas funciones, áreas de servicio y anuncios.",
    "cityUpdates.subject": "Te avisaremos cuando Sweepr llegue a tu área",
    "cityUpdates.body": "¡Estás en nuestra lista! En cuanto Sweepr se lance en tu área, serás el primero en saberlo.",
    "waitlist.subject": "¡Estás en la lista de espera de Sweepr!",
    "waitlist.body.customer": "Buenas noticias: ¡estás en la lista! Nos expandimos rápidamente y te contactaremos tan pronto como Sweepr esté disponible cerca de ti.",
    "waitlist.body.cleaner": "¡Gracias por tu interés en limpiar con Sweepr! Te contactaremos tan pronto como estemos aceptando nuevos limpiadores en tu área.",
    "booking.confirmed.subject": "Tu reserva en Sweepr está confirmada",
    "booking.confirmed.body":
      "Recibimos tu pago y tu limpieza está reservada. Pronto te asignaremos a un limpiador de primera.",
    "payment.failed.subject": "Pago fallido — acción requerida",
    "payment.failed.body":
      "No pudimos procesar tu pago. Actualiza tu método de pago para confirmar tu reserva.",
    "refund.subject": "Tu reembolso de Sweepr ha sido procesado",
    "refund.body":
      "Tu reembolso para la reserva {bookingId} ha sido procesado y aparecerá en tu estado de cuenta en 5–10 días hábiles.",
  },
  vi: {
    "newsletter.confirm.subject": "Bạn đã đăng ký nhận cập nhật từ Sweepr",
    "newsletter.confirm.body": "Cảm ơn bạn đã đăng ký! Bạn đã có trong danh sách cập nhật của Sweepr. Chúng tôi sẽ thông báo về các tính năng mới, khu vực dịch vụ và thông báo.",
    "cityUpdates.subject": "Chúng tôi sẽ thông báo khi Sweepr đến khu vực của bạn",
    "cityUpdates.body": "Bạn đã có trong danh sách của chúng tôi! Ngay khi Sweepr ra mắt tại khu vực của bạn, bạn sẽ là người đầu tiên biết.",
    "waitlist.subject": "Bạn đã có trong danh sách chờ của Sweepr!",
    "waitlist.body.customer": "Tin tốt — bạn đã có trong danh sách! Chúng tôi đang mở rộng nhanh chóng và sẽ liên hệ ngay khi Sweepr có mặt gần bạn.",
    "waitlist.body.cleaner": "Cảm ơn bạn đã quan tâm đến việc làm việc với Sweepr! Chúng tôi sẽ liên lạc ngay khi tuyển nhận viên mới tại khu vực của bạn.",
    "booking.confirmed.subject": "Đặt lịch Sweepr của bạn đã được xác nhận",
    "booking.confirmed.body":
      "Chúng tôi đã nhận được thanh toán của bạn và lịch dọn dẹp đã được đặt. Chúng tôi sẽ sớm ghép bạn với người dọn dẹp được đánh giá cao.",
    "payment.failed.subject": "Thanh toán thất bại — cần hành động",
    "payment.failed.body":
      "Chúng tôi không thể xử lý thanh toán của bạn. Vui lòng cập nhật phương thức thanh toán để xác nhận đặt lịch của bạn.",
    "refund.subject": "Khoản hoàn tiền Sweepr của bạn đã được xử lý",
    "refund.body":
      "Khoản hoàn tiền cho đặt lịch {bookingId} đã được xử lý và sẽ xuất hiện trên sao kê trong 5–10 ngày làm việc.",
  },
  "zh-Hans": {
    "newsletter.confirm.subject": "您已订阅 Sweepr 更新",
    "newsletter.confirm.body": "感谢您的订阅！您已加入 Sweepr 更新列表。我们将为您推送新功能、服务区域和公告。",
    "cityUpdates.subject": "Sweepr 进入您所在地区时我们会通知您",
    "cityUpdates.body": "您已加入我们的列表！一旦 Sweepr 在您所在地区上线，您将第一个知道。",
    "waitlist.subject": "您已进入 Sweepr 候补名单！",
    "waitlist.body.customer": "好消息——您已在名单上！我们正在快速扩张，一旦 Sweepr 在您附近可用，我们将立即联系您。",
    "waitlist.body.cleaner": "感谢您对加入 Sweepr 清洁团队的兴趣！一旦我们在您所在地区招募新清洁师，我们将与您联系。",
    "booking.confirmed.subject": "您的 Sweepr 预约已确认",
    "booking.confirmed.body":
      "我们已收到您的付款，您的清洁服务已预约成功。我们将很快为您匹配一位优秀的清洁师。",
    "payment.failed.subject": "付款失败——需要处理",
    "payment.failed.body":
      "我们无法处理您的付款。请更新您的付款方式以确认预约。",
    "refund.subject": "您的 Sweepr 退款已处理",
    "refund.body":
      "预约 {bookingId} 的退款已处理，将在 5–10 个工作日内显示在您的账单上。",
  },
  "zh-Hant": {
    "newsletter.confirm.subject": "您已訂閱 Sweepr 更新",
    "newsletter.confirm.body": "感謝您的訂閱！您已加入 Sweepr 更新清單。我們將為您推送新功能、服務區域和公告。",
    "cityUpdates.subject": "Sweepr 進入您所在地區時我們會通知您",
    "cityUpdates.body": "您已加入我們的清單！一旦 Sweepr 在您所在地區上線，您將第一個知道。",
    "waitlist.subject": "您已進入 Sweepr 候補名單！",
    "waitlist.body.customer": "好消息——您已在名單上！我們正在快速擴張，一旦 Sweepr 在您附近可用，我們將立即聯繫您。",
    "waitlist.body.cleaner": "感謝您對加入 Sweepr 清潔團隊的興趣！一旦我們在您所在地區招募新清潔師，我們將與您聯繫。",
    "booking.confirmed.subject": "您的 Sweepr 預約已確認",
    "booking.confirmed.body":
      "我們已收到您的付款，您的清潔服務已預約成功。我們將很快為您配對一位優秀的清潔師。",
    "payment.failed.subject": "付款失敗——需要處理",
    "payment.failed.body":
      "我們無法處理您的付款。請更新您的付款方式以確認預約。",
    "refund.subject": "您的 Sweepr 退款已處理",
    "refund.body":
      "預約 {bookingId} 的退款已處理，將在 5–10 個工作日內顯示在您的帳單上。",
  },
  fil: {
    "newsletter.confirm.subject": "Naka-subscribe ka na sa mga update ng Sweepr",
    "newsletter.confirm.body": "Salamat sa pag-subscribe! Nasa listahan ka na ng mga update ng Sweepr. Ipapaalam namin sa iyo ang mga bagong feature, lugar ng serbisyo, at anunsyo.",
    "cityUpdates.subject": "Aabisuhan ka namin kapag dumating ang Sweepr sa iyong lugar",
    "cityUpdates.body": "Nasa aming listahan ka na! Sa sandaling mag-launch ang Sweepr sa iyong lugar, ikaw ang unang malalaman.",
    "waitlist.subject": "Nasa waitlist ka na ng Sweepr!",
    "waitlist.body.customer": "Magandang balita — nasa listahan ka na! Mabilis kaming lumalawak at makikipag-ugnayan sa iyo sa lalong madaling panahon na available na ang Sweepr malapit sa iyo.",
    "waitlist.body.cleaner": "Salamat sa iyong interes na maglinis kasama ang Sweepr! Makikipag-ugnayan kami sa iyo sa sandaling tumatanggap na kami ng mga bagong cleaner sa iyong lugar.",
    "booking.confirmed.subject": "Nakumpirma na ang iyong booking sa Sweepr",
    "booking.confirmed.body":
      "Natanggap na namin ang iyong bayad at naka-book na ang iyong linis. Maghahanap kami ng pinakamahusay na cleaner para sa iyo.",
    "payment.failed.subject": "Nabigo ang bayad — kailangan ng aksyon",
    "payment.failed.body":
      "Hindi namin maproseso ang iyong bayad. Mangyaring i-update ang iyong paraan ng pagbabayad upang kumpirmahin ang iyong booking.",
    "refund.subject": "Naproseso na ang iyong refund sa Sweepr",
    "refund.body":
      "Ang iyong refund para sa booking {bookingId} ay naproseso na at lalabas sa iyong pahayag sa loob ng 5–10 araw ng trabaho.",
  },
  ko: {
    "newsletter.confirm.subject": "Sweepr 업데이트를 구독하셨습니다",
    "newsletter.confirm.body": "구독해 주셔서 감사합니다! 이제 Sweepr 업데이트 목록에 포함되었습니다. 새로운 기능, 서비스 지역, 공지사항을 알려드리겠습니다.",
    "cityUpdates.subject": "귀하 지역에 Sweepr가 출시되면 알려드리겠습니다",
    "cityUpdates.body": "목록에 추가되었습니다! Sweepr가 귀하 지역에 출시되는 즉시 가장 먼저 알려드리겠습니다.",
    "waitlist.subject": "Sweepr 대기자 명단에 등록되었습니다!",
    "waitlist.body.customer": "좋은 소식입니다 — 명단에 등록되었습니다! 저희는 빠르게 확장 중이며 귀하 근처에서 Sweepr를 이용하실 수 있게 되면 연락드리겠습니다.",
    "waitlist.body.cleaner": "Sweepr와 함께 청소에 관심을 가져주셔서 감사합니다! 귀하 지역에서 새로운 청소 전문가를 모집하게 되면 연락드리겠습니다.",
    "booking.confirmed.subject": "Sweepr 예약이 확인되었습니다",
    "booking.confirmed.body":
      "결제가 완료되었으며 청소 예약이 확정되었습니다. 곧 최고 평점의 청소 전문가와 매칭해 드리겠습니다.",
    "payment.failed.subject": "결제 실패 — 조치 필요",
    "payment.failed.body":
      "결제를 처리할 수 없었습니다. 예약을 확정하려면 결제 수단을 업데이트해 주세요.",
    "refund.subject": "Sweepr 환불이 처리되었습니다",
    "refund.body":
      "예약 {bookingId}에 대한 환불이 처리되었으며 5~10 영업일 이내에 명세서에 표시됩니다.",
  },
  ar: {
    "newsletter.confirm.subject": "أنت مشترك في تحديثات Sweepr",
    "newsletter.confirm.body": "شكرًا لاشتراكك! أنت الآن في قائمة تحديثات Sweepr. سنبقيك على اطلاع بالميزات الجديدة ومناطق الخدمة والإعلانات.",
    "cityUpdates.subject": "سنخبرك عندما يصل Sweepr إلى منطقتك",
    "cityUpdates.body": "أنت في قائمتنا! بمجرد إطلاق Sweepr في منطقتك، ستكون أول من يعلم.",
    "waitlist.subject": "أنت على قائمة انتظار Sweepr!",
    "waitlist.body.customer": "أخبار رائعة — أنت في القائمة! نحن نتوسع بسرعة وسنتواصل معك بمجرد توفر Sweepr بالقرب منك.",
    "waitlist.body.cleaner": "شكرًا على اهتمامك بالعمل مع Sweepr! سنتواصل معك بمجرد قبول منظفين جدد في منطقتك.",
    "booking.confirmed.subject": "تم تأكيد حجزك في Sweepr",
    "booking.confirmed.body":
      "تم استلام دفعتك وتم حجز خدمة التنظيف. سنوفر لك أحد أفضل المنظفين قريبًا.",
    "payment.failed.subject": "فشل الدفع — يلزم اتخاذ إجراء",
    "payment.failed.body":
      "لم نتمكن من معالجة دفعتك. يرجى تحديث طريقة الدفع لتأكيد حجزك.",
    "refund.subject": "تمت معالجة استرداد أموالك من Sweepr",
    "refund.body":
      "تمت معالجة استرداد الأموال للحجز {bookingId} وستظهر في كشف حسابك خلال 5–10 أيام عمل.",
  },
  pt: {
    "newsletter.confirm.subject": "Você está inscrito nas atualizações do Sweepr",
    "newsletter.confirm.body": "Obrigado por se inscrever! Você agora está na lista de atualizações do Sweepr. Manteremos você informado sobre novos recursos, áreas de serviço e anúncios.",
    "cityUpdates.subject": "Avisaremos quando o Sweepr chegar à sua área",
    "cityUpdates.body": "Você está na nossa lista! Assim que o Sweepr for lançado na sua área, você será o primeiro a saber.",
    "waitlist.subject": "Você está na lista de espera do Sweepr!",
    "waitlist.body.customer": "Ótimas notícias — você está na lista! Estamos expandindo rapidamente e entraremos em contato assim que o Sweepr estiver disponível perto de você.",
    "waitlist.body.cleaner": "Obrigado pelo seu interesse em limpar com o Sweepr! Entraremos em contato assim que estivermos aceitando novos profissionais na sua área.",
    "booking.confirmed.subject": "Sua reserva no Sweepr está confirmada",
    "booking.confirmed.body":
      "Recebemos seu pagamento e sua limpeza está agendada. Em breve encontraremos um profissional de alto nível para você.",
    "payment.failed.subject": "Pagamento falhou — ação necessária",
    "payment.failed.body":
      "Não conseguimos processar seu pagamento. Atualize seu método de pagamento para confirmar sua reserva.",
    "refund.subject": "Seu reembolso do Sweepr foi processado",
    "refund.body":
      "Seu reembolso para a reserva {bookingId} foi processado e aparecerá no seu extrato em 5–10 dias úteis.",
  },
  hi: {
    "newsletter.confirm.subject": "आप Sweepr अपडेट के लिए सब्सक्राइब हो गए हैं",
    "newsletter.confirm.body": "सब्सक्राइब करने के लिए धन्यवाद! आप अब Sweepr अपडेट सूची में हैं। हम आपको नई सुविधाओं, सेवा क्षेत्रों और घोषणाओं के बारे में जानकारी देते रहेंगे।",
    "cityUpdates.subject": "जब Sweepr आपके क्षेत्र में आएगा तो हम आपको बताएंगे",
    "cityUpdates.body": "आप हमारी सूची में हैं! जैसे ही Sweepr आपके क्षेत्र में लॉन्च होगा, आप सबसे पहले जानेंगे।",
    "waitlist.subject": "आप Sweepr की प्रतीक्षा सूची में हैं!",
    "waitlist.body.customer": "अच्छी खबर — आप सूची में हैं! हम तेजी से विस्तार कर रहे हैं और जैसे ही Sweepr आपके पास उपलब्ध होगा, हम संपर्क करेंगे।",
    "waitlist.body.cleaner": "Sweepr के साथ सफाई में रुचि दिखाने के लिए धन्यवाद! जैसे ही हम आपके क्षेत्र में नए सफाईकर्मियों को स्वीकार करना शुरू करेंगे, हम संपर्क करेंगे।",
    "booking.confirmed.subject": "आपकी Sweepr बुकिंग की पुष्टि हो गई है",
    "booking.confirmed.body":
      "हमें आपका भुगतान प्राप्त हो गया है और आपकी सफाई बुक हो गई है। हम जल्द ही आपको एक शीर्ष-रेटेड सफाईकर्मी से जोड़ेंगे।",
    "payment.failed.subject": "भुगतान विफल — कार्रवाई आवश्यक",
    "payment.failed.body":
      "हम आपका भुगतान संसाधित नहीं कर सके। अपनी बुकिंग की पुष्टि के लिए कृपया अपना भुगतान तरीका अपडेट करें।",
    "refund.subject": "आपका Sweepr रिफंड प्रोसेस हो गया है",
    "refund.body":
      "बुकिंग {bookingId} के लिए आपका रिफंड प्रोसेस हो गया है और 5–10 कार्य दिवसों के भीतर आपके स्टेटमेंट पर दिखेगा।",
  },
};

const VALID_LANGS = new Set<string>([
  "en", "es", "vi", "zh-Hans", "zh-Hant", "fil", "ko", "ar", "pt", "hi",
]);

function toLangCode(lang: string | null | undefined): LangCode {
  if (lang && VALID_LANGS.has(lang)) return lang as LangCode;
  return "en";
}

/**
 * Translate an email string key for the given language.
 * Supports simple {placeholder} variable substitution.
 * Always falls back to English.
 */
export function et(
  lang: string | null | undefined,
  key: string,
  vars?: Record<string, string>,
): string {
  const code = toLangCode(lang);
  const value = TRANSLATIONS[code]?.[key] ?? TRANSLATIONS.en[key] ?? key;
  if (!vars) return value;
  return Object.entries(vars).reduce(
    (s, [k, v]) => s.replaceAll(`{${k}}`, v),
    value,
  );
}

/** Whether the language is written right-to-left. */
export function isRtl(lang: string | null | undefined): boolean {
  return toLangCode(lang) === "ar";
}
