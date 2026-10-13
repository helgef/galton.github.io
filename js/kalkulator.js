import {
  indekser,
  fondHosTilbyder,
  sammenlignPortefolje,
  dagerSiden,
  MAKS_ALDER_DAGER,
  prosent,
  kroner,
  dato,
} from "./fondspriser.js";

const $ = (id) => document.getElementById(id);
const tilbyderValg = $("tilbyder");
const fondfelt = $("fondfelt");
const fondrader = $("fondrader");
const fondliste = $("fondliste");

let data;
let fondPerEtikett = new Map();
let resultatRapportert = false;

const etikett = (fond) => `${fond.navn} · ${fond.isin}`;
const lesBelop = (tekst) => Number(String(tekst).replace(/[^\d]/g, "")) || 0;

function element(tag, egenskaper = {}, ...barn) {
  const el = document.createElement(tag);
  Object.assign(el, egenskaper);
  el.append(...barn);
  return el;
}

function finnFond(tekst) {
  const verdi = tekst.trim();
  if (!verdi) return null;
  if (fondPerEtikett.has(verdi)) return fondPerEtikett.get(verdi);
  const isin = verdi.toUpperCase();
  return data.fondPerIsin.get(isin) ?? null;
}

function leggTilRad() {
  const nr = fondrader.children.length + 1;
  const navn = element("input", { type: "text", placeholder: "Søk fond eller ISIN", autocomplete: "off" });
  navn.setAttribute("list", "fondliste");
  navn.setAttribute("aria-label", `Fond ${nr}`);
  const belop = element("input", { type: "text", placeholder: "Beløp i kr" });
  belop.setAttribute("inputmode", "numeric");
  belop.setAttribute("aria-label", `Beløp for fond ${nr}`);
  belop.addEventListener("blur", () => {
    const kr = lesBelop(belop.value);
    belop.value = kr ? new Intl.NumberFormat("nb-NO").format(kr) : "";
  });
  const fjern = element("button", { type: "button", className: "fjern", textContent: "Fjern" });
  fjern.setAttribute("aria-label", `Fjern fond ${nr}`);
  fjern.addEventListener("click", () => {
    rad.remove();
    if (!fondrader.children.length) leggTilRad();
    beregn();
  });
  const rad = element("div", { className: "fondrad" }, navn, belop, fjern);
  fondrader.append(rad);
  return navn;
}

function oppdaterFondliste() {
  const tilbyderId = tilbyderValg.value;
  const fond = tilbyderId ? fondHosTilbyder(data, tilbyderId) : [];
  fondPerEtikett = new Map(fond.map((f) => [etikett(f), f]));
  fondliste.replaceChildren(...fond.map((f) => element("option", { value: etikett(f) })));
  fondfelt.disabled = !tilbyderId;
  $("fondhint").textContent = tilbyderId
    ? `${fond.length} fond hos ${data.tilbyderPerId.get(tilbyderId).navn} i Finansportalen. Søk på fondsnavn eller ISIN.`
    : "Velg tilbyder først. Du kan søke på fondsnavn eller ISIN.";
}

function lesPosisjoner() {
  const posisjoner = [];
  const ikkeFunnet = [];
  for (const rad of fondrader.children) {
    const [navn, belop] = rad.querySelectorAll("input");
    const kr = lesBelop(belop.value);
    if (!navn.value.trim() || !kr) continue;
    const fond = finnFond(navn.value);
    if (fond) posisjoner.push({ isin: fond.isin, belop: kr });
    else ikkeFunnet.push(navn.value.trim());
  }
  return { posisjoner, ikkeFunnet };
}

function visResultat(r, ikkeFunnet) {
  const tilbyder = data.tilbyderPerId.get(tilbyderValg.value).navn;
  const tall = $("resultat-tall");
  if (r.forskjellKrAar > 0.5) {
    $("resultat-innledning").textContent = `Med disse fondene hos Galton i stedet for hos ${tilbyder} kan du spare`;
    tall.textContent = `${kroner(r.forskjellKrAar)} i året`;
    tall.className = "stortall bra";
    $("resultat-over-tid").textContent =
      `Det blir rundt ${kroner(r.forskjell10Aar)} over 10 år og ${kroner(r.forskjell20Aar)} over 20 år.* ` +
      `Snittprisen går fra ${prosent(r.snittDagens)} til ${prosent(r.snittGalton)} i året.`;
  } else if (r.forskjellKrAar < -0.5) {
    $("resultat-innledning").textContent = `Du betaler allerede mindre hos ${tilbyder} enn du ville gjort hos Galton for disse fondene:`;
    tall.textContent = `${kroner(-r.forskjellKrAar)} mindre i året`;
    tall.className = "stortall";
    $("resultat-over-tid").textContent = "Da er det ingen grunn til å bytte for prisens skyld.";
  } else {
    $("resultat-innledning").textContent = `Du betaler omtrent det samme hos ${tilbyder} som hos Galton for disse fondene.`;
    tall.textContent = prosent(r.snittDagens);
    tall.className = "stortall";
    $("resultat-over-tid").textContent = "Årlig pris i snitt, både nå og hos Galton.";
  }

  $("resultat-linjer").replaceChildren(
    ...r.linjer.map((l) =>
      element(
        "tr",
        {},
        element("td", { textContent: l.navn }),
        element("td", { className: "tall", textContent: kroner(l.belop) }),
        element("td", { className: "tall", textContent: prosent(l.dagens) }),
        element("td", { className: "tall", textContent: prosent(l.galton) }),
        element("td", { className: "tall", textContent: kroner(l.forskjellKrAar) }),
      ),
    ),
  );

  const ukjente = [
    ...ikkeFunnet,
    ...r.ukjente.map((isin) => data.fondPerIsin.get(isin)?.navn ?? isin),
  ];
  $("resultat-ukjente").hidden = !ukjente.length;
  $("resultat-ukjente").textContent = ukjente.length
    ? `Ikke med i beregningen, fordi vi ikke fant fondet hos ${tilbyder} i Finansportalen: ${ukjente.join(", ")}.`
    : "";

  $("resultat").hidden = false;
  if (!resultatRapportert && typeof window.gtag === "function") {
    // Bare hendelsen, aldri beløp eller beholdning.
    window.gtag("event", "kalkulator_resultat");
    resultatRapportert = true;
  }
}

function beregn() {
  if (!tilbyderValg.value) {
    $("resultat").hidden = true;
    return;
  }
  const { posisjoner, ikkeFunnet } = lesPosisjoner();
  const r = sammenlignPortefolje(data, tilbyderValg.value, posisjoner);
  if (!r.linjer.length) {
    $("resultat").hidden = true;
    return;
  }
  visResultat(r, ikkeFunnet);
}

async function start() {
  try {
    const svar = await fetch("/data/fondspriser.json");
    if (!svar.ok) throw new Error(String(svar.status));
    data = indekser(await svar.json());
  } catch (feil) {
    console.error(feil);
    $("datastatus").textContent = "Vi fikk ikke hentet prisdataene. Prøv igjen senere.";
    tilbyderValg.disabled = true;
    return;
  }

  tilbyderValg.append(...data.tilbydere.map((t) => element("option", { value: t.id, textContent: t.navn })));
  const forvalgt = new URLSearchParams(location.search).get("tilbyder");
  if (forvalgt && data.tilbyderPerId.has(forvalgt)) tilbyderValg.value = forvalgt;

  const alder = dagerSiden(data.hentet);
  $("datastatus").textContent =
    `Priser fra Finansportalen, hentet ${dato(data.hentet)}.` +
    (alder > MAKS_ALDER_DAGER ? " Tallene kan være utdatert." : "");

  leggTilRad();
  oppdaterFondliste();

  tilbyderValg.addEventListener("change", () => {
    oppdaterFondliste();
    beregn();
  });
  $("legg-til").addEventListener("click", () => leggTilRad().focus());
  $("kalkulator").addEventListener("input", beregn);
  $("kalkulator").addEventListener("submit", (e) => e.preventDefault());
}

start();
