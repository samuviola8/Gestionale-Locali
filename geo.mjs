const lat = 37.5697, lon = 15.0776; // Sant'Agata li Battiati
for (const q of ["Via Antonino di Sangiuliano 40", "Via Etnea 100", "Via Roma 12"]) {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "5");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const d = await r.json();
  console.log("\n=== " + q);
  for (const f of d.features ?? []) {
    const p = f.properties;
    console.log(`  type=${p.type} street=${p.street ?? "-"} name=${p.name ?? "-"} civico=${p.housenumber ?? "-"} ${p.postcode ?? ""} ${p.city ?? ""}`);
  }
}
