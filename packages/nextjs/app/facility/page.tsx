import { FacilityConsole } from "@/components/FacilityConsole";
import { getRecipe } from "@collateral-rail/shared/recipes";

type FacilityPageProps = {
  searchParams: Promise<{
    recipe?: string;
    mode?: string;
    offer?: string;
    position?: string;
    terminal?: string;
  }>;
};

function bytes32(value: string | undefined) {
  return value && /^0x[a-fA-F0-9]{64}$/.test(value) ? value : "";
}

export default async function FacilityPage({
  searchParams,
}: FacilityPageProps) {
  const params = await searchParams;
  const recipe = getRecipe(params.recipe);
  const mode = params.mode === "live" ? "live" : "reference";
  const terminal = params.terminal === "settle" ? "settle" : "repay";

  return (
    <main className="consolePage">
      <FacilityConsole
        initialMode={mode}
        initialOfferId={bytes32(params.offer)}
        initialPositionId={bytes32(params.position)}
        initialRecipeId={recipe.id}
        initialTerminalChoice={terminal}
      />
    </main>
  );
}
