// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {TestBase} from "./TestBase.sol";
import {RailAcceptance} from "../contracts/verifiers/RailAcceptance.sol";
import {MockAtsToken} from "./mocks/MockAtsToken.sol";
import {MockOracle} from "./mocks/MockOracle.sol";
import {AtsCollateralRailHarness} from "./mocks/AtsCollateralRailHarness.sol";
import {RailTestPolicy} from "./RailTestPolicy.sol";

contract RailAcceptanceTest is TestBase {
    function testAcceptanceReadsConfigurationEligibilityAndSolvency() public {
        address lender = address(0x1EAD);
        address borrower = address(0xB0770);
        MockAtsToken token = new MockAtsToken();
        token.setKyc(lender, true);
        token.setKyc(borrower, true);
        token.setMaturity(block.timestamp + 730 days);
        MockOracle oracle = new MockOracle(25_000_000);
        AtsCollateralRailHarness rail = new AtsCollateralRailHarness(
            token, bytes32(uint256(1)), oracle, 0, 100 * 1e8, RailTestPolicy.defaults(), address(this)
        );
        RailAcceptance acceptance = new RailAcceptance(rail);

        RailAcceptance.Result memory result = acceptance.check(lender, borrower);
        assertTrue(result.tokenBinding);
        assertTrue(result.partitionBinding);
        assertTrue(result.nominalBinding);
        assertTrue(result.tokenDecimalsBinding);
        assertTrue(result.usdCurrencyBinding);
        assertTrue(result.clearingDisabled);
        assertTrue(result.policyConfigured);
        assertTrue(result.internalKycReady);
        assertTrue(result.counterpartiesEligible);
        assertTrue(result.assetMaturityLive);
        assertTrue(result.cashSolvent);
        acceptance.requireAccepted(lender, borrower);
    }

    function testAcceptanceFailsClosedWhenAtsConfigurationDrifts() public {
        address lender = address(0x1EAD);
        address borrower = address(0xB0770);
        MockAtsToken token = new MockAtsToken();
        token.setKyc(lender, true);
        token.setKyc(borrower, true);
        token.setMaturity(block.timestamp + 730 days);
        MockOracle oracle = new MockOracle(25_000_000);
        AtsCollateralRailHarness rail = new AtsCollateralRailHarness(
            token, bytes32(uint256(1)), oracle, 0, 100 * 1e8, RailTestPolicy.defaults(), address(this)
        );
        RailAcceptance acceptance = new RailAcceptance(rail);

        token.setAssetConfiguration(true, 2, 9_999, 2, bytes3("EUR"));
        RailAcceptance.Result memory result = acceptance.check(lender, borrower);
        assertFalse(result.nominalBinding);
        assertFalse(result.tokenDecimalsBinding);
        assertFalse(result.usdCurrencyBinding);
        assertFalse(result.clearingDisabled);
        vm.expectRevert(abi.encodeWithSelector(RailAcceptance.AcceptanceFailed.selector, result));
        acceptance.requireAccepted(lender, borrower);
    }
}
