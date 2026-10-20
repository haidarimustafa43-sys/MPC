import { getDatabase } from "./database";

/** Custom scenarios imported by a teacher, kept in this browser only. */
export const saveCustomScenario = async (id: string, scenario: unknown, now: string): Promise<void> => {
  await (await getDatabase()).put("scenarios", { id, importedAt: now, scenario });
};

export const listCustomScenarios = async (): Promise<unknown[]> =>
  (await (await getDatabase()).getAll("scenarios")).map((record) => record.scenario);

export const deleteCustomScenario = async (id: string): Promise<void> => {
  await (await getDatabase()).delete("scenarios", id);
};
