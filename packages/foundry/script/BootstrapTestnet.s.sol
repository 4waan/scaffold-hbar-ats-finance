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
    function envOr(string calldata name, address defaultValue) external view returns (address value);
    function envOr(string calldata name, bytes32 defaultValue) external view returns (bytes32 value);
    function startBroadcast() external;
    function startBroadcast(uint256 privateKey) external;
    function stopBroadcast() external;
    function addr(uint256 privateKey) external pure returns (address keyAddr);
    function serializeAddress(string calldata objectKey, string calldata valueKey, address value)
        external
        returns (string memory json);
    function serializeUint(string calldata objectKey, string calldata valueKey, uint256 value)
        external
        returns (string memory json);
    function writeJson(string calldata json, string calldata path) external;
}

contract BootstrapTestnet {
    struct BootstrapConfig {
        address operator;
        address lender;
        address borrower;
        address resolver;
        address factory;
        address pyth;
    }

    VmBootstrap internal constant vm = VmBootstrap(address(uint160(uint256(keccak256("hevm cheat code")))));

    address internal constant DEFAULT_RESOLVER = 0xBA2D5FC2083A0b8f164c50e65d782087fBA18E0a;
    address internal constant DEFAULT_FACTORY = 0xd1F118A40f3b02883D35909eF2517e7EDd78379d;
    address internal constant DEFAULT_PYTH = 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729;
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
        BootstrapConfig memory config = _readConfig();
        _validateDependencies(config.resolver, config.factory, config.pyth);

        uint256 maturity = block.timestamp + 730 days;
        IAtsFactory.BondData memory bond = _bond(config.operator, maturity, config.resolver);
        IAtsFactory.FactoryRegulationData memory regulation = _regulation();

        _startBroadcast(config.operator);
        address token = IAtsFactory(config.factory).deployBond(bond, regulation);
        if (!IAtsIssuerSetup(token).addIssuer(config.operator)) {
            revert SetupFailed(IAtsIssuerSetup.addIssuer.selector);
        }
        if (!IAtsIssuerSetup(token)
                .grantKyc(config.lender, "collateral-rail-lender", block.timestamp, maturity, config.operator)) {
            revert SetupFailed(IAtsIssuerSetup.grantKyc.selector);
        }
        if (!IAtsIssuerSetup(token)
                .grantKyc(config.borrower, "collateral-rail-borrower", block.timestamp, maturity, config.operator)) {
            revert SetupFailed(IAtsIssuerSetup.grantKyc.selector);
        }
        IAtsIssuerSetup(token).issue(config.borrower, 1_000, bytes(""));

        PythHbarUsdOracle priceOracle = new PythHbarUsdOracle(IPyth(config.pyth), HBAR_USD_PRICE_ID);
        AtsCollateralRail rail = new AtsCollateralRail(
            IAtsCollateralToken(token),
            DEFAULT_PARTITION,
            priceOracle,
            0,
            100 * 1e8,
            _termCreditPolicy(),
            config.operator
        );
        rail.fundAutomation{value: 2 * rail.HSS_RESERVE_TINYBAR()}();
        RailAcceptance acceptance = new RailAcceptance(rail);
        vm.stopBroadcast();

        _validateLiveConfiguration(token, config.operator, config.lender, config.borrower, maturity);
        _writeAddresses(token, address(priceOracle), address(rail), address(acceptance), config, maturity);
        emit BootstrapCompleted(token, address(priceOracle), address(rail));
    }

    function _readConfig() internal view returns (BootstrapConfig memory config) {
        config.operator = vm.envOr("HEDERA_OPERATOR_ADDRESS", address(0));
        if (config.operator == address(0)) config.operator = vm.envAddress("HARNESS_SIGNER_EVM_ADDRESS");
        config.lender = vm.envAddress("LENDER_ADDRESS");
        config.borrower = vm.envAddress("BORROWER_ADDRESS");
        config.resolver = vm.envOr("ATS_RESOLVER_ADDRESS", DEFAULT_RESOLVER);
        config.factory = vm.envOr("ATS_FACTORY_ADDRESS", DEFAULT_FACTORY);
        config.pyth = vm.envOr("PYTH_ADDRESS", DEFAULT_PYTH);
    }

    function _startBroadcast(address operator) internal {
        bytes32 harnessKey = vm.envOr("HARNESS_SIGNER_PRIVATE_KEY", bytes32(0));
        if (harnessKey == bytes32(0)) {
            vm.startBroadcast();
            return;
        }
        uint256 privateKey = uint256(harnessKey);
        if (vm.addr(privateKey) != operator) revert ConfigurationMismatch();
        vm.startBroadcast(privateKey);
    }

    function _validateDependencies(address resolver, address factory, address pyth) internal view {
        if (resolver.code.length == 0) revert DependencyUnavailable(resolver);
        if (factory.code.length == 0) revert DependencyUnavailable(factory);
        if (pyth.code.length == 0) revert DependencyUnavailable(pyth);
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

    function _bond(address operator, uint256 maturity, address resolver)
        internal
        view
        returns (IAtsFactory.BondData memory bond)
    {
        bytes32[4] memory roles = [DEFAULT_ADMIN_ROLE, ROLE_ISSUER, ROLE_KYC, ROLE_SSI_MANAGER];
        IAtsFactory.Rbac[] memory rbacs = new IAtsFactory.Rbac[](roles.length);
        for (uint256 i = 0; i < roles.length; ++i) {
            address[] memory members = new address[](1);
            members[0] = operator;
            rbacs[i] = IAtsFactory.Rbac({role: roles[i], members: members});
        }

        IAtsFactory.SecurityData memory security = IAtsFactory.SecurityData({
            resolver: resolver,
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

    function _termCreditPolicy() internal pure returns (AtsCollateralRail.RailPolicy memory) {
        return AtsCollateralRail.RailPolicy({
            maximumAdvanceBps: 7_000,
            maximumAnnualRateBps: 10_000,
            maximumQuoteMovementBps: 100,
            minimumTermSeconds: 2 minutes,
            maximumTermSeconds: 365 days,
            maximumOfferLifetimeSeconds: 24 hours
        });
    }

    function _writeAddresses(
        address token,
        address oracle,
        address rail,
        address acceptance,
        BootstrapConfig memory config,
        uint256 maturity
    ) internal {
        string memory key = "deployment";
        vm.serializeAddress(key, "atsToken", token);
        vm.serializeAddress(key, "oracle", oracle);
        vm.serializeAddress(key, "rail", rail);
        vm.serializeAddress(key, "acceptance", acceptance);
        vm.serializeAddress(key, "factory", config.factory);
        vm.serializeAddress(key, "resolver", config.resolver);
        vm.serializeAddress(key, "pyth", config.pyth);
        vm.serializeAddress(key, "operator", config.operator);
        vm.serializeAddress(key, "lender", config.lender);
        vm.serializeAddress(key, "borrower", config.borrower);
        string memory json = vm.serializeUint(key, "assetMaturity", maturity);
        vm.writeJson(json, "./deployments/latest-addresses.json");
    }
}
