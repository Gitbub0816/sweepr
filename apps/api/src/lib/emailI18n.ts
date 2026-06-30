/**
 * Lightweight email translation helper for the API layer.
 * Only contains keys used in outbound customer emails.
 * Falls back to "en" for any missing key or unknown language.
 */

export type LangCode = "en" | "es" | "vi" | "zh-Hans" | "zh-Hant" | "fil" | "ko" | "ar" | "pt" | "hi";

const TRANSLATIONS: Record<LangCode, Record<string, string>> = {
  en: {
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
