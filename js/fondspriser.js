// Felles prisberegning for byttekalkulatoren og sammenligningssiden.
// Alle satser er i prosent per år (0.1 = 0,1 %), slik Finansportalen oppgir dem.
//
// Årlig pris hos en tilbyder = løpende kostnader i fondet + plattformgebyr − returprovisjon
// som betales tilbake til kunden. Galton tar 0,1 % i plattformhonorar på alle fond og
// betaler tilbake all returprovisjon; vi bruker den høyeste returprovisjonen noen
// tilbyder oppgir for fondet som anslag på hele returprovisjonen.

export const GALTON_PLATTFORMHONORAR = 0.1;
export const ANTATT_AVKASTNING = 0.065;
export const MIN_DEKNING_I_SAMMENLIGNING = 50;
export const MAKS_ALDER_DAGER = 14;

// En typisk norsk fondsportefølje: 50 % indeks, 40 % aktive aksjefond, 10 % rente.
export const KURV = [
  { isin: "NO0010582984", vekt: 30 }, // DNB Global Indeks A
  { isin: "NO0010817893", vekt: 10 }, // Storebrand Indeks - Alle Markeder N
  { isin: "NO0010582976", vekt: 10 }, // DNB Norge Indeks A
  { isin: "NO0010337678", vekt: 10 }, // DNB Teknologi A
  { isin: "NO0010817372", vekt: 10 }, // Delphi Global N
  { isin: "NO0010679038", vekt: 5 }, // SKAGEN Kon-Tiki B
  { isin: "NO0010678998", vekt: 5 }, // SKAGEN Vekst B
  { isin: "NO0010732852", vekt: 5 }, // ODIN Global D
  { isin: "NO0011031486", vekt: 5 }, // Eika Norden N
  { isin: "NO0012445768", vekt: 10 }, // KLP Kredittobligasjon N
];

export function indekser(data) {
  return {
    ...data,
    fondPerIsin: new Map(data.fond.map((f) => [f.isin, f])),
    tilbyderPerId: new Map(data.tilbydere.map((t) => [t.id, t])),
  };
}

const maksReturprovisjon = (fond) => Math.max(0, ...fond.tilbud.map(([, , returprovisjon]) => returprovisjon));

export function galtonPris(fond) {
  return fond.lopende + GALTON_PLATTFORMHONORAR - maksReturprovisjon(fond);
}

export function tilbyderPris(fond, tilbyderId) {
  const tilbud = fond.tilbud.find(([id]) => id === tilbyderId);
  if (!tilbud) return null;
  const [, plattformgebyr, returprovisjon] = tilbud;
  return fond.lopende + plattformgebyr - returprovisjon;
}

export function fondHosTilbyder(data, tilbyderId) {
  return data.fond.filter((f) => f.tilbud.some(([id]) => id === tilbyderId));
}

// Forskjellen i kroner etter `aar` år når hele beløpet vokser med avkastning minus kostnad.
export function forskjellOverTid(belop, kostnadDagens, kostnadGalton, aar, avkastning = ANTATT_AVKASTNING) {
  const vekst = (kostnad) => belop * (1 + avkastning - kostnad / 100) ** aar;
  return vekst(kostnadGalton) - vekst(kostnadDagens);
}

// posisjoner: [{ isin, belop }]. Fond tilbyderen ikke har, hoppes over og listes i `ukjente`.
export function sammenlignPortefolje(data, tilbyderId, posisjoner) {
  const linjer = [];
  const ukjente = [];
  for (const { isin, belop } of posisjoner) {
    const fond = data.fondPerIsin.get(isin);
    const dagens = fond && tilbyderPris(fond, tilbyderId);
    if (!fond || dagens === null || !(belop > 0)) {
      ukjente.push(isin);
      continue;
    }
    const galton = galtonPris(fond);
    linjer.push({ isin, navn: fond.navn, belop, dagens, galton, forskjellKrAar: (belop * (dagens - galton)) / 100 });
  }
  const sum = linjer.reduce((s, l) => s + l.belop, 0);
  const snitt = (felt) => (sum ? linjer.reduce((s, l) => s + l.belop * l[felt], 0) / sum : 0);
  const snittDagens = snitt("dagens");
  const snittGalton = snitt("galton");
  return {
    linjer,
    ukjente,
    sum,
    snittDagens,
    snittGalton,
    forskjellKrAar: (sum * (snittDagens - snittGalton)) / 100,
    forskjell10Aar: forskjellOverTid(sum, snittDagens, snittGalton, 10),
    forskjell20Aar: forskjellOverTid(sum, snittDagens, snittGalton, 20),
  };
}

// Sammenligner Galton med hver tilbyder på kurvens fond. Tilbydere som ikke har alle fondene,
// sammenlignes på de fondene de har, med vektene skalert opp; `dekning` er andelen av kurven.
export function sammenlignKurv(data, kurv = KURV) {
  const fondIKurv = kurv
    .map(({ isin, vekt }) => ({ fond: data.fondPerIsin.get(isin), vekt }))
    .filter(({ fond }) => fond);
  const totalVekt = fondIKurv.reduce((s, k) => s + k.vekt, 0);
  const galton = fondIKurv.reduce((s, k) => s + k.vekt * galtonPris(k.fond), 0) / totalVekt;

  const rader = data.tilbydere
    .map((tilbyder) => {
      const hos = fondIKurv
        .map((k) => ({ ...k, pris: tilbyderPris(k.fond, tilbyder.id) }))
        .filter((k) => k.pris !== null);
      const vekt = hos.reduce((s, k) => s + k.vekt, 0);
      if (!vekt) return null;
      const pris = hos.reduce((s, k) => s + k.vekt * k.pris, 0) / vekt;
      const galtonSamme = hos.reduce((s, k) => s + k.vekt * galtonPris(k.fond), 0) / vekt;
      return {
        id: tilbyder.id,
        navn: tilbyder.navn,
        dekning: Math.round((100 * vekt) / totalVekt),
        pris,
        galtonSamme,
        merkostnad: pris - galtonSamme,
      };
    })
    .filter((r) => r && r.dekning >= MIN_DEKNING_I_SAMMENLIGNING)
    .sort((a, b) => a.merkostnad - b.merkostnad);

  return {
    fond: fondIKurv.map(({ fond, vekt }) => ({ isin: fond.isin, navn: fond.navn, indeks: fond.indeks, vekt, galton: galtonPris(fond) })),
    manglerFond: kurv.length - fondIKurv.length,
    galton,
    rader,
    // Påstanden «billigst på en typisk fondsportefølje» brukes bare når den holder mot alle.
    galtonBilligst: rader.length > 0 && rader.every((r) => r.merkostnad > 0.005),
  };
}

const median = (verdier) => {
  if (!verdier.length) return null;
  const s = [...verdier].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s.at(m) : (s.at(m - 1) + s.at(m)) / 2;
};

export function plattformgebyrPerTilbyder(data, minAntallFond = 100) {
  return data.tilbydere
    .map((t) => {
      const indeks = [];
      const aktive = [];
      for (const fond of data.fond) {
        const tilbud = fond.tilbud.find(([id]) => id === t.id);
        if (tilbud) (fond.indeks ? indeks : aktive).push(tilbud[1]);
      }
      return { id: t.id, navn: t.navn, antall: indeks.length + aktive.length, indeks: median(indeks), aktive: median(aktive) };
    })
    .filter((r) => r.antall >= minAntallFond)
    .sort((a, b) => (a.aktive ?? 0) - (b.aktive ?? 0) || a.navn.localeCompare(b.navn, "nb"));
}

export function dagerSiden(isoDato, idag = new Date()) {
  return Math.floor((idag - new Date(`${isoDato}T00:00:00Z`)) / 864e5);
}

const prosentFormat = new Intl.NumberFormat("nb-NO", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kroneFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 0 });

export const prosent = (verdi) => `${prosentFormat.format(verdi)} %`;
export const prosentpoeng = (verdi) => `${verdi >= 0 ? "+" : "−"}${prosentFormat.format(Math.abs(verdi))} pp`;
export const kroner = (verdi) => `${kroneFormat.format(Math.round(verdi))} kr`;
export const dato = (isoDato) => isoDato.split("-").reverse().join(".");
