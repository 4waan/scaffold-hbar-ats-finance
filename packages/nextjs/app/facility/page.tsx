import { FacilityConsole } from "@/components/FacilityConsole";
import { getRecipe } from "@collateral-rail/shared/recipes";

type FacilityPageProps = {
  searchParams: Promise<{ recipe?: string; mode?: string }>;
};

export default async function FacilityPage({
  searchParams,
}: FacilityPageProps) {
  const params = await searchParams;
  const recipe = getRecipe(params.recipe);
  const mode = params.mode === "live" ? "live" : "reference";

  return (
    <main className="consolePage">
      <FacilityConsole initialMode={mode} initialRecipeId={recipe.id} />
    </main>
  );
}
