import { readFileSync, writeFileSync } from "node:fs";

const input = process.argv[2];
const output = process.argv[3];
if (!input || !output) {
  console.error("usage: node scripts/zap-json-to-sarif.mjs report.json report.sarif");
  process.exit(1);
}

const report = JSON.parse(readFileSync(input, "utf8").replace(/^\uFEFF/, ""));
const alerts = (report.site ?? []).flatMap((site) => site.alerts ?? []);
const levelForRisk = { 3: "error", 2: "warning", 1: "note", 0: "note" };
const rules = new Map();
const results = [];

for (const alert of alerts) {
  const id = String(alert.pluginid);
  const name = alert.alert || alert.name || id;
  const level = levelForRisk[String(alert.riskcode)] || "warning";
  if (!rules.has(id)) {
    const tags = [];
    if (alert.cweid && alert.cweid !== "-1") tags.push(`external/cwe/cwe-${alert.cweid}`);
    rules.set(id, {
      id,
      name,
      shortDescription: { text: name },
      fullDescription: { text: strip(alert.desc) || name },
      help: { text: strip(alert.solution) || "See the ZAP alert." },
      defaultConfiguration: { level },
      properties: { tags },
    });
  }
  for (const instance of alert.instances ?? [{ uri: "http://127.0.0.1:3000" }]) {
    results.push({
      ruleId: id,
      level,
      message: {
        text: instance.evidence ? `${name}: ${instance.evidence}` : name,
      },
      locations: [
        {
          physicalLocation: {
            artifactLocation: { uri: instance.uri || "http://127.0.0.1:3000" },
          },
        },
      ],
    });
  }
}

const sarif = {
  $schema:
    "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
  version: "2.1.0",
  runs: [
    {
      tool: {
        driver: {
          name: "ZAP",
          informationUri: "https://www.zaproxy.org/",
          rules: [...rules.values()],
        },
      },
      results,
    },
  ],
};

writeFileSync(output, JSON.stringify(sarif));

function strip(value) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
