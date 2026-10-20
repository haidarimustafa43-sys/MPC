import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scenarioJsonSchema } from "./jsonSchema";

describe("scenario JSON Schema", () => {
  it("is up to date with the Zod schema (run `npm run schema` after changing it)", () => {
    const published = JSON.parse(readFileSync("public/scenario.schema.json", "utf8"));
    expect(published).toEqual(JSON.parse(JSON.stringify(scenarioJsonSchema())));
  });
});
