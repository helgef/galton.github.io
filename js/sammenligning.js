import {
  indekser,
  sammenlignKurv,
  plattformgebyrPerTilbyder,
  dagerSiden,
  MAKS_ALDER_DAGER,
  GALTON_PLATTFORMHONORAR,
  prosent,
  prosentpoeng,
  kroner,
  dato,
} from "./fondspriser.js";

const $ = (id) => document.getElementById(id);

function element(tag, egenskaper = {}, ...barn) {
  const el = document.createElement(tag);
  Object.assign(el, egenskaper);
  el.append(...barn);
  return el;
}

const SYNLIGE_RADER = 12;

// Viser de første radene og legger resten bak en knapp under tabellen.
function begrensRader(tbody, synlige = SYNLIGE_RADER) {
  const rader = [...tbody.children];
  if (rader.length <= synlige + 1) return;
  rader.slice(synlige).forEach((rad) => (rad.hidden = true));
  const knapp = element("button", {
    type: "button",
    className: "sekundar vis-alle",
    textContent: `Vis alle ${rader.length - 1} tilbydere`,
  });
  knapp.addEventListener("click", () => {
    rader.forEach((rad) => (rad.hidden = false));
    knapp.remove();
  });
  tbody.closest(".tabell").after(knapp);
}

const celle = (tekst, tall = false) => element("td", { textContent: tekst, className: tall ? "tall" : "" });

function visHovedtall(kurv, fersk, hentet) {
  const nærmeste = kurv.rader.at(0);
  if (kurv.galtonBilligst && fersk) {
    $("paastand-innledning").textContent = "Galton er";
    $("paastand").textContent = "Billigst på en typisk fondsportefølje*";
    $("paastand-detalj").textContent =
      `Kurven koster ${prosent(kurv.galton)} i året hos Galton. ` +
      `Nærmeste tilbyder er ${nærmeste.navn}, som er ${prosentpoeng(nærmeste.merkostnad)} dyrere ` +
      `(${kroner(5000 * nærmeste.merkostnad)} i året på 500 000 kr).`;
    $("fotnote-dato").textContent = dato(hentet);
    $("paastand-fotnote").hidden = false;
  } else {
    // Uten ferske tall, eller hvis noen er like billige, viser vi bare prisen – ingen superlativ.
    $("paastand-innledning").textContent = "En typisk fondsportefølje koster hos Galton";
    $("paastand").textContent = `${prosent(kurv.galton)} i året`;
    $("paastand-detalj").textContent = "Fondets egne kostnader og plattformhonoraret er inkludert.";
  }
  $("hovedtall").hidden = false;
}

function visKurv(kurv) {
  $("kurv").replaceChildren(
    ...kurv.fond.map((f) =>
      element(
        "tr",
        {},
        celle(f.navn),
        celle(f.indeks ? "Indeks" : "Aktivt / rente"),
        celle(`${f.vekt} %`, true),
        celle(prosent(f.galton), true),
      ),
    ),
  );
}

function visTilbydere(kurv) {
  const galton = element(
    "tr",
    { className: "galton" },
    celle("Galton"),
    celle("100 %", true),
    celle(prosent(kurv.galton), true),
    celle("–", true),
    celle("–", true),
    celle("–", true),
  );
  $("tilbydere").replaceChildren(
    galton,
    ...kurv.rader.map((r) =>
      element(
        "tr",
        {},
        celle(r.navn),
        celle(`${r.dekning} %`, true),
        celle(prosent(r.pris), true),
        celle(prosent(r.galtonSamme), true),
        celle(prosentpoeng(r.merkostnad), true),
        celle(kroner(5000 * r.merkostnad), true),
      ),
    ),
  );
}

function visGebyrer(data) {
  const galton = element(
    "tr",
    { className: "galton" },
    celle("Galton"),
    celle("alle", true),
    celle(prosent(GALTON_PLATTFORMHONORAR), true),
    celle(prosent(GALTON_PLATTFORMHONORAR), true),
  );
  $("gebyrer").replaceChildren(
    galton,
    ...plattformgebyrPerTilbyder(data).map((r) =>
      element(
        "tr",
        {},
        celle(r.navn),
        celle(String(r.antall), true),
        celle(r.indeks === null ? "–" : prosent(r.indeks), true),
        celle(r.aktive === null ? "–" : prosent(r.aktive), true),
      ),
    ),
  );
}

async function start() {
  let data;
  try {
    const svar = await fetch("/data/fondspriser.json");
    if (!svar.ok) throw new Error(String(svar.status));
    data = indekser(await svar.json());
  } catch (feil) {
    console.error(feil);
    $("datastatus").textContent = "Vi fikk ikke hentet prisdataene. Prøv igjen senere.";
    return;
  }

  const fersk = dagerSiden(data.hentet) <= MAKS_ALDER_DAGER;
  if (!fersk) {
    $("utdatert").textContent = `Prisene er fra ${dato(data.hentet)} og kan være utdatert. Vi viser derfor ingen sammenligningspåstand før tallene er oppdatert.`;
    $("utdatert").hidden = false;
  }
  $("hentet").textContent = dato(data.hentet);

  const kurv = sammenlignKurv(data);
  visHovedtall(kurv, fersk, data.hentet);
  visKurv(kurv);
  visTilbydere(kurv);
  visGebyrer(data);
  begrensRader($("tilbydere"));
  begrensRader($("gebyrer"));
}

start();
