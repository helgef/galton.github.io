// Henter fond og distributørpriser fra Finansportalen og skriver en kompakt
// data/fondspriser.json som kalkulatoren og sammenligningssiden leser.
// Kjøres ukentlig av .github/workflows/fondspriser.yml. Feiler uten å
// overskrive filen hvis svaret ser ufullstendig ut.

import { writeFile } from "node:fs/promises";

const API = "https://fond-api.forbrukerradet.no/fund/funds";
const UT = new URL("../data/fondspriser.json", import.meta.url);
const MIN_ANTALL_FOND = 500;

const tall = (verdi) => (verdi === null || verdi === undefined || verdi === "" ? null : Number(verdi));

async function hentAlle() {
  const fond = [];
  for (let side = 1; ; side++) {
    const svar = await fetch(`${API}?limit=1000&page=${side}`, { headers: { accept: "application/json" } });
    if (!svar.ok) throw new Error(`Finansportalen svarte ${svar.status} på side ${side}`);
    const { data, meta } = await svar.json();
    fond.push(...data);
    if (side >= meta.pages) return { fond, totalt: meta.total };
  }
}

function komprimer(raa) {
  const tilbydere = new Map();
  const fond = [];
  for (const f of raa) {
    const lopende = tall(f.sumOngoingCosts);
    if (lopende === null || !f.companyDistributionFees?.length) continue;
    const tilbud = f.companyDistributionFees.map((c) => {
      if (!tilbydere.has(c.company.slug)) {
        tilbydere.set(c.company.slug, { id: c.company.slug, navn: c.company.displayName });
      }
      return [c.company.slug, tall(c.platformFeeRate) ?? 0, tall(c.commissionRebateRate) ?? 0];
    });
    fond.push({
      isin: f.isin,
      navn: f.securityName.trim(),
      forvalter: f.compLongName,
      indeks: Boolean(f.isIndex) || /indeks|index/i.test(f.securityName),
      lopende,
      tilbud,
    });
  }
  fond.sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
  const tilbyderliste = [...tilbydere.values()].sort((a, b) => a.navn.localeCompare(b.navn, "nb"));
  return { fond, tilbydere: tilbyderliste };
}

const { fond: raa, totalt } = await hentAlle();
if (raa.length < MIN_ANTALL_FOND || raa.length !== totalt) {
  throw new Error(`Fikk ${raa.length} av ${totalt} fond, forventet minst ${MIN_ANTALL_FOND}. Beholder forrige fil.`);
}

const { fond, tilbydere } = komprimer(raa);
const resultat = {
  hentet: new Date().toISOString().slice(0, 10),
  kilde: "https://www.forbrukerradet.no/finansportalen/fond/",
  tilbydere,
  fond,
};
await writeFile(UT, JSON.stringify(resultat) + "\n");
console.log(`Skrev ${fond.length} fond og ${tilbydere.length} tilbydere til ${UT.pathname}`);
