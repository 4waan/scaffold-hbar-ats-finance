"use client";

import Link from "next/link";
import { useState } from "react";
import { facilityRecipes } from "@collateral-rail/shared/recipes";

function duration(seconds: number) {
  if (seconds < 86_400) return `${Math.round(seconds / 60)} minutes`;
  return `${Math.round(seconds / 86_400)} days`;
}

export function RecipeExplorer() {
  const [selectedId, setSelectedId] = useState(facilityRecipes[0].id);
  const recipe =
    facilityRecipes.find((candidate) => candidate.id === selectedId) ??
    facilityRecipes[0];

  return (
    <div className="recipeExplorer">
      <div className="recipeTabs" role="tablist" aria-label="Financing recipes">
        {facilityRecipes.map((candidate) => (
          <button
            aria-controls="selected-recipe"
            aria-selected={candidate.id === recipe.id}
            className={candidate.id === recipe.id ? "selected" : ""}
            key={candidate.id}
            onClick={() => setSelectedId(candidate.id)}
            role="tab"
            type="button"
          >
            {candidate.name}
          </button>
        ))}
      </div>

      <article id="selected-recipe" role="tabpanel" className="recipeDetail">
        <div>
          <span className="kicker">Selected blueprint</span>
          <h2>{recipe.name}</h2>
          <p>{recipe.purpose}</p>
        </div>
        <dl className="policyList">
          <div>
            <dt>Advance ceiling</dt>
            <dd>{recipe.policy.maximumAdvanceBps / 100}%</dd>
          </div>
          <div>
            <dt>Maximum term</dt>
            <dd>{duration(recipe.policy.maximumTermSeconds)}</dd>
          </div>
          <div>
            <dt>Quote movement</dt>
            <dd>{recipe.policy.maximumQuoteMovementBps / 100}%</dd>
          </div>
        </dl>
        <div className="recipeLifecycle" aria-label="Recipe lifecycle">
          <span>Quote</span>
          <span>Fund</span>
          <span>Hold</span>
          <span>Repay or settle</span>
        </div>
        <Link
          className="primaryButton"
          href={`/facility?recipe=${recipe.id}&mode=reference`}
        >
          Open this blueprint
        </Link>
      </article>
    </div>
  );
}
