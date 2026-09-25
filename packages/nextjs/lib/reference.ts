import deployment from "../../foundry/deployments/reference-testnet.json";
import {
  lifecycleLabels,
  type ReferenceDeployment,
} from "@collateral-rail/shared/evidence";

export const referenceDeployment = deployment as ReferenceDeployment;
export { lifecycleLabels };
export type { ReferenceDeployment };
