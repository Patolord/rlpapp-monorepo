const PHONE_COUNTRY = "55";
const PHONE_AREA = "11";
const PHONE_PREFIX = "98578";
const PHONE_LINE = "2307";

export function openCompanyWhatsApp(prefilledText?: string) {
  const phone = `${PHONE_COUNTRY}${PHONE_AREA}${PHONE_PREFIX}${PHONE_LINE}`;
  const url = prefilledText
    ? `https://wa.me/${phone}?text=${encodeURIComponent(prefilledText)}`
    : `https://wa.me/${phone}`;
  window.open(url, "_blank", "noopener,noreferrer");
}
