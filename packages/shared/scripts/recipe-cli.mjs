import { loadRecipes } from "./recipe-lib.mjs";

const command = process.argv[2] ?? "list";
const recipes = await loadRecipes();

if (command === "list") {
  for (const recipe of recipes) {
    console.log(`${recipe.id.padEnd(18)} ${recipe.name}: ${recipe.purpose}`);
  }
} else if (command === "check") {
  console.log(`Validated ${recipes.length} financing recipes.`);
} else {
  throw new Error(`Unknown recipe command: ${command}.`);
}
