/**
 * Complete ISO 3166-1 alpha-2 country list. Names come from Intl.DisplayNames
 * in the visitor's language (EN/ES/PT); the ISO code is what gets stored
 * (customers.country, orders.shipping_address.countryCode, addresses.country)
 * because it drives channel, currency and freight later.
 */
export const COUNTRY_CODES = (
  "AF AX AL DZ AS AD AO AI AQ AG AR AM AW AU AT AZ BS BH BD BB BY BE BZ BJ BM BT BO BQ BA BW BV BR IO BN BG BF BI CV KH CM CA KY CF TD CL CN CX CC CO KM CG CD CK CR CI HR CU CW CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FK FO FJ FI FR GF PF TF GA GM GE DE GH GI GR GL GD GP GU GT GG GN GW GY HT HM VA HN HK HU IS IN ID IR IQ IE IM IL IT JM JP JE JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MQ MR MU YT MX FM MD MC MN ME MS MA MZ MM NA NR NP NL NC NZ NI NE NG NU NF MK MP NO OM PK PW PS PA PG PY PE PH PN PL PT PR QA RE RO RU RW BL SH KN LC MF PM VC WS SM ST SA SN RS SC SL SG SX SK SI SB SO ZA GS SS ES LK SD SR SJ SE CH SY TW TJ TZ TH TL TG TK TO TT TN TR TM TC TV UG UA AE GB US UM UY UZ VU VE VN VG VI WF EH YE ZM ZW"
).split(" ");

export function countryName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: "region" }).of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

function fold(s: string) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** Countries sorted by localized name. */
export function countryOptions(locale: string): { code: string; name: string }[] {
  const collator = new Intl.Collator(locale);
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) })).sort((a, b) => collator.compare(a.name, b.name));
}

export function filterCountries(options: { code: string; name: string }[], query: string) {
  const q = fold(query.trim());
  if (!q) return options;
  return options.filter((o) => fold(o.name).includes(q) || o.code.toLowerCase() === q);
}

/** Free text ("United States", "brasil", "US") → ISO code; null when unknown. */
export function toCountryCode(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  if (/^[a-z]{2}$/i.test(v) && COUNTRY_CODES.includes(v.toUpperCase())) return v.toUpperCase();
  const f = fold(v);
  for (const locale of ["en", "pt", "es"]) {
    for (const code of COUNTRY_CODES) {
      if (fold(countryName(code, locale)) === f) return code;
    }
  }
  return null;
}

/** Brazil buyers default to the Brazil B2B channel, everyone else to International B2B. */
export function defaultB2bChannel(countryCode: string | null | undefined) {
  return (countryCode ?? "").toUpperCase() === "BR" ? "br_b2b" : "intl_b2b";
}
