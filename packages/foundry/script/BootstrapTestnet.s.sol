// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAtsFactory} from "../contracts/interfaces/IAtsFactory.sol";
import {IAtsCollateralToken, IAtsIssuerSetup} from "../contracts/interfaces/IAtsCollateralToken.sol";
import {IPyth} from "../contracts/interfaces/IPyth.sol";
import {PythHbarUsdOracle} from "../contracts/oracle/PythHbarUsdOracle.sol";
import {AtsCollateralRail} from "../contracts/AtsCollateralRail.sol";
import {RailAcceptance} from "../contracts/verifiers/RailAcceptance.sol";

interface VmBootstrap {
    function envAddress(string calldata name) external view returns (address value);
    function startBroadcast() external;
    function stopBroadcast() external;
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value)
        external
        returns (string memory json);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value)
        external
        returns (string memory json);
    function writeJson(string calldata json, string calldata path) external;
}

contract BootstrapTestnet {
    VmBootstrap internal constant vm = VmBootstrap(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant DEFAULT_RESOLVER = 0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a;
    address internal constant DEFAULT_FACTORY = 0xd1F118A40f3b02883D35909eF2517e7EDd78379d;
    address internal constant PYTH = 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729;
    address internal constant HSS = address(0x16b);
    bytes32 internal constant HBAR_USD_PRICE_ID = 0x3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd;
    bytes32 internal constant DEFAULT_PARTITION = bytes32(uint256(1));
    bytes32 internal constant BOND_CONFIG = bytes32(uint256(2));

    bytes32 internal constant DEFAULT_ADMIN_ROLE = bytes32(0);
    bytes32 internal constant ROLE_ISSUER = 0x5eeaf5602c75bf26e73b5206d0bd6ee82f621166255e5fd73cc06bc7bd84a95f;
    bytes32 internal constant ROLE_KYC = 0x754f499f9fdfbb089d12bdec817a6863d593d8a3ea7f546c00a5cafd20957bfc;
    bytes32 internal constant ROLE_SSI_MANAGER = 0x3120494a82251fe85b0403877539486dbfcf0f94c20741a3229cfad31f625ee1;

    error DependencyUnavailable(address dependency);
    error SetupFailed(bytes4 selector);
    error ConfigurationMismatch();

    event BootstrapCompleted(address indexed token, address indexed oracle, address indexed rail);

    function run() external {
        address operator = vm.envAddress("HEDERA_OPERATOR_ADDRESS");
        address lender = vm.envAddress("LENDER_ADDRESS");
        address borrower = vm.envAddress("BORROWER_ADDRESS");
        _validateDependencies();

        uint256 maturity = block.timestamp + 730 days;
        IAtsFactory.BondData memory bond = _bond(operator, maturity);
        IAtsFactory.FactoryRegulationData memory regulation = _regulation();

        vm.startBroadcast();
        address token = IAtsFactory(DEFAULT_FACTORY).deployBond(bond, regulation);
        if (!IAtsIssuerSetup(token).addIssuer(operator)) {
            revert SetupFailed(IAtsIssuerSetup.addIssuer.selector);
        }
        if (!IAtsIssuerSetup(token).grantKyc(lender, "collateral-rail-lender", block.timestamp, maturity, operator)) {
            revert SetupFailed(IAtsIssuerSetup.grantKyc.selector);
        }
        if (!IAtsIssuerSetup(token).grantKyc(borrower, "collateral-rail-borrower", block.timestamp, maturity, operator))
        {
            revert SetupFailed(IAtsIssuerSetup.grantKyc.selector);
        }
        IAtsIssuerSetup(token).issue(borrower, 1_000, bytes(""));

        PythHbarUsdOracle priceOracle = new PythHbarUsdOracle(IPyth(PYTH), HBAR_USD_PRICE_ID);
        AtsCollateralRail rail =
            new AtsCollateralRail(IAtsCollateralToken(token), DEFAULT_PARTITION, priceOracle, 0, 100 * 1e8, operator);
        rail.fundAutomation{value: rail.HSS_RESERVE_TINYBAR()}();
        RailAcceptance acceptance = new RailAcceptance(rail);
        vm.stopBroadcast();

        _validateLiveConfiguration(token, operator, lender, borrower, maturity);
        _writeAddresses(
            token, address(priceOracle), address(rail), address(acceptance), operator, lender, borrower, maturity
        );
        emit BootstrapCompleted(token, address(priceOracle), address(rail));
    }

    function _validateDependencies() internal view {
        if (DEFAULT_RESOLVER.code.length == 0) revert DependencyUnavailable(DEFAULT_RESOLVER);
        if (DEFAULT_FACTORY.code.length == 0) revert DependencyUnavailable(DEFAULT_FACTORY);
        if (PYTH.code.length == 0) revert DependencyUnavailable(PYTH);
        (bool success, bytes memory result) = HSS.staticcall(
            abi.encodeWithSignature("hasScheduleCapacity(uint256,uint256)", block.timestamp + 10, uint256(750_000))
        );
        if (!success || result.length < 32) revert DependencyUnavailable(HSS);
    }

    function _validateLiveConfiguration(
        address token,
        address operator,
        address lender,
        address borrower,
        uint256 maturity
    ) internal view {
        IAtsCollateralToken runtime = IAtsCollateralToken(token);
        IAtsIssuerSetup setup = IAtsIssuerSetup(token);
        if (
            !setup.isInternalKycActivated() || !setup.isIssuer(operator)
                || runtime.getKycStatusFor(lender) != IAtsCollateralToken.KycStatus.GRANTED
                || runtime.getKycStatusFor(borrower) != IAtsCollateralToken.KycStatus.GRANTED
                || runtime.getMaturityDate() != maturity || !runtime.hasRole(ROLE_ISSUER, operator)
                || !runtime.hasRole(ROLE_KYC, operator) || !runtime.hasRole(ROLE_SSI_MANAGER, operator)
        ) revert ConfigurationMismatch();
    }

    function _bond(address operator, uint256 maturity) internal view returns (IAtsFactory.BondData memory bond) {
        bytes32[4] memory roles = [DEFAULT_ADMIN_ROLE, ROLE_ISSUER, ROLE_KYC, ROLE_SSI_MANAGER];
        IAtsFactory.Rbac[] memory rbacs = new IAtsFactory.Rbac[](roles.length);
        for (uint256 i = 0; i < roles.length; ++i) {
            address[] memory members = new address[](1);
            members[0] = operator;
            rbacs[i] = IAtsFactory.Rbac({role: roles[i], members: members});
        }

        IAtsFactory.SecurityData memory security = IAtsFactory.SecurityData({
            resolver: DEFAULT_RESOLVER,
            maxSupply: 1_000_000,
            resolverProxyConfiguration: IAtsFactory.ResolverProxyConfiguration({key: BOND_CONFIG, version: 1}),
            erc20MetadataInfo: IAtsFactory.ERC20MetadataInfo({
                name: "Collateral Rail Test Bond 2028", symbol: "CRTB", isin: "XS0COLRAIL07", decimals: 0
            }),
            rbacs: rbacs,
            externalPauses: new address[](0),
            externalControlLists: new address[](0),
            externalKycLists: new address[](0),
            compliance: address(0),
            identityRegistry: address(0),
            arePartitionsProtected: false,
            isMultiPartition: false,
            isControllable: true,
            isWhiteList: false,
            clearingActive: false,
            internalKycActivated: true,
            erc20VotesActivated: false
        });

        bond = IAtsFactory.BondData({
            security: security,
            bondDetails: IAtsFactory.BondDetailsData({
                currency: bytes3("USD"),
                nominalValue: 10_000,
                nominalValueDecimals: 2,
                startingDate: block.timestamp,
                maturityDate: maturity
            }),
            proceedRecipients: new address[](0),
            proceedRecipientsData: new bytes[](0)
        });
    }

    function _regulation() internal pure returns (IAtsFactory.FactoryRegulationData memory) {
        return IAtsFactory.FactoryRegulationData({
            regulationType: IAtsFactory.RegulationType.REG_S,
            regulationSubType: IAtsFactory.RegulationSubType.NONE,
            additionalSecurityData: IAtsFactory.AdditionalSecurityData({
                countriesControlListType: false,
                listOfCountries: "",
                info: "Collateral Rail self-contained testnet security"
            })
        });
    }

    function _writeAddresses(
        address token,
        address oracle,
        address rail,
        address acceptance,
        address operator,
        address lender,
        address borrower,
        uint256 maturity
    ) internal {
        string memory key = "deployment";
        vm.serializeAddress(key, "atsToken", token);
        vm.serializeAddress(key, "oracle", oracle);
        vm.serializeAddress(key, "rail", rail);
        vm.serializeAddress(key, "acceptance", acceptance);
        vm.serializeAddress(key, "factory", DEFAULT_FACTORY);
        vm.serializeAddress(key, "resolver", DEFAULT_RESOLVER);
        vm.serializeAddress(key, "pyth", PYTH);
        vm.serializeAddress(key, "operator", operator);
        vm.serializeAddress(key, "lender", lender);
        vm.serializeAddress(key, "borrower", borrower);
        string memory json = vm.serializeUint(key, "assetMaturity", maturity);
        vm.writeJson(json, "./deployments/latest-addresses.json");
    }
}
