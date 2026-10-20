import { writeFileSync } from "node:fs";
import { scenarioJsonSchema } from "../src/scenarios/jsonSchema";

// Run with `npm run schema`; the result is served next to the app.
writeFileSync("public/scenario.schema.json", `${JSON.stringify(scenarioJsonSchema(), null, 2)}\n`);
console.log("public/scenario.schema.json written");
