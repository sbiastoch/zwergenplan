/**
 * Unit-Tests laufen nie gegen das Live-Netz (Plan 0002): Quellen-Parser bekommen gespeicherte
 * Snapshots aus tests/fixtures/pipeline/. Ein versehentlicher fetch wird hier sofort rot.
 */
globalThis.fetch = () => {
  throw new Error("Kein Netz in Unit-Tests – Snapshot aus tests/fixtures/pipeline/ verwenden");
};
