import { buildApp } from "./composition/build-app.js";

const app = buildApp();
const diagnostics = app.getStartupDiagnostics();

for (const diagnostic of diagnostics) {
  const detail = diagnostic.detail ? ` - ${diagnostic.detail}` : "";
  console.log(`${diagnostic.status.toUpperCase()} ${diagnostic.name}${detail}`);
}
