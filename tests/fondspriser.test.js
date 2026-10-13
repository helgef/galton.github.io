import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  indekser,
  galtonPris,
  tilbyderPris,
  sammenlignPortefolje,
  sammenlignKurv,
  plattformgebyrPerTilbyder,
  forskjellOverTid,
  dagerSiden,
} from "../js/fondspriser.js";

const naer = (faktisk, forventet, toleranse = 1e-9) =>
  assert.ok(Math.abs(faktisk - forventet) < toleranse, `${faktisk} ≠ ${forventet}`);

const testdata = indekser({
  hentet: "2026-10-13",
  tilbydere: [
    { id: "bank", navn: "Banken" },
    { id: "nett", navn: "Nettplattform" },
  ],
  fond: [
    { isin: "AKTIV", navn: "Aktivt fond", indeks: false, lopende: 1.5, tilbud: [["bank", 0.6, 0], ["nett", 0.29, 0.27]] },
    { isin: "INDEKS", navn: "Indeksfond", indeks: true, lopende: 0.2, tilbud: [["bank", 0.3, 0], ["nett", 0.09, 0]] },
    { isin: "BARE_BANK", navn: "Bankens eget", indeks: false, lopende: 1, tilbud: [["bank", 0, 0]] },
  ],
});

test("tilbyderpris er løpende kostnad + plattformgebyr − returprovisjon", () => {
  naer(tilbyderPris(testdata.fondPerIsin.get("AKTIV"), "nett"), 1.52);
  naer(tilbyderPris(testdata.fondPerIsin.get("AKTIV"), "bank"), 2.1);
  assert.equal(tilbyderPris(testdata.fondPerIsin.get("BARE_BANK"), "nett"), null);
});

test("Galton tar 0,1 % og betaler tilbake den høyeste returprovisjonen", () => {
  naer(galtonPris(testdata.fondPerIsin.get("AKTIV")), 1.5 + 0.1 - 0.27);
  naer(galtonPris(testdata.fondPerIsin.get("INDEKS")), 0.3);
});

test("porteføljesammenligning vekter etter beløp og hopper over fond tilbyderen ikke har", () => {
  const r = sammenlignPortefolje(testdata, "nett", [
    { isin: "AKTIV", belop: 300_000 },
    { isin: "INDEKS", belop: 100_000 },
    { isin: "BARE_BANK", belop: 50_000 },
  ]);
  assert.deepEqual(r.ukjente, ["BARE_BANK"]);
  assert.equal(r.sum, 400_000);
  // Aktivt: 1,52 mot 1,33 = 0,19 pp av 300 000. Indeks: 0,29 mot 0,30 = −0,01 pp av 100 000.
  naer(r.forskjellKrAar, 570 - 10, 1e-6);
  naer(r.linjer.at(1).forskjellKrAar, -10, 1e-6);
});

test("forskjell over tid gir null ved lik kostnad og vokser med tiden", () => {
  naer(forskjellOverTid(100_000, 0.5, 0.5, 20), 0);
  const ti = forskjellOverTid(100_000, 0.6, 0.1, 10);
  const tjue = forskjellOverTid(100_000, 0.6, 0.1, 20);
  assert.ok(ti > 500 * 10 && tjue > ti * 2);
});

test("kurvsammenligning skalerer vektene til fondene tilbyderen har", () => {
  const kurv = [
    { isin: "AKTIV", vekt: 50 },
    { isin: "INDEKS", vekt: 50 },
  ];
  const r = sammenlignKurv(testdata, kurv);
  const nett = r.rader.find((x) => x.id === "nett");
  assert.equal(nett.dekning, 100);
  naer(nett.merkostnad, (0.19 - 0.01) / 2);
  assert.equal(r.galtonBilligst, true);
});

test("billigst-påstanden faller når én tilbyder er like billig", () => {
  const kurv = [{ isin: "INDEKS", vekt: 100 }];
  const r = sammenlignKurv(testdata, kurv);
  assert.equal(r.galtonBilligst, false);
});

test("dager siden henting", () => {
  assert.equal(dagerSiden("2026-10-01", new Date("2026-10-15T12:00:00Z")), 14);
});

test("ekte data: Galton er billigst på kurven, og tallene stemmer med strategianalysen", async () => {
  const data = indekser(JSON.parse(await readFile(new URL("../data/fondspriser.json", import.meta.url))));
  const r = sammenlignKurv(data);
  assert.equal(r.manglerFond, 0);
  naer(r.galton, 0.6685, 0.01);
  assert.equal(r.galtonBilligst, true);
  const norne = r.rader.find((x) => x.id === "norne");
  naer(norne.merkostnad, 0.05, 0.02);
  const gebyrer = plattformgebyrPerTilbyder(data);
  assert.ok(gebyrer.some((g) => g.id === "nordnet"));
});
