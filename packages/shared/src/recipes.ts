import customFacility from "../recipes/custom-facility.json";
import maturityBridge from "../recipes/maturity-bridge.json";
import termCredit from "../recipes/term-credit.json";

export type RailPolicy = {
  maximumAdvanceBps: number;
  maximumAnnualRateBps: number;
  maximumQuoteMovementBps: number;
  minimumTermSeconds: number;
  maximumTermSeconds: number;
  maximumOfferLifetimeSeconds: number;
};

export type FacilityRecipe = {
  id: string;
  name: string;
  purpose: string;
  policy: RailPolicy;
  defaultTerms: {
    collateralAmount: string;
    principalUsd: string;
    annualRateBps: number;
    termSeconds: number;
  };
  editableFields: string[];
  extensionNotes: string[];
};

export const facilityRecipes = [
  termCredit,
  maturityBridge,
  customFacility,
] satisfies FacilityRecipe[];

export const defaultRecipe = facilityRecipes[0];

export function getRecipe(id: string | null | undefined): FacilityRecipe {
  return facilityRecipes.find((recipe) => recipe.id === id) ?? defaultRecipe;
}
