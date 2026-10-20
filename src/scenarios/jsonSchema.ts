import { zodToJsonSchema } from "zod-to-json-schema";
import { scenarioSchema } from "./schema";

/**
 * JSON Schema for a complete scenario file, generated from the Zod schema the
 * application validates with. Teachers can use it in an editor for
 * autocompletion; referential checks (unknown ids, cyclic BOMs) still need the
 * application or `npm run test`.
 */
export const scenarioJsonSchema = (): object => ({
  ...zodToJsonSchema(scenarioSchema, { name: "Scenario", $refStrategy: "none" }),
  title: "MPC Planning Game scenario",
});
