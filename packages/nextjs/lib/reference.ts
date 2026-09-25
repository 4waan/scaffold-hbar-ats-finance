import deployment from "../../foundry/deployments/reference-testnet.json";
import type { ReferenceDeployment } from "@collateral-rail/shared/evidence";

export const referenceDeployment = deployment as ReferenceDeployment;
export type { ReferenceDeployment };
