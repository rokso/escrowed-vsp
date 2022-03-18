// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./interface/IVSPBond.sol";

abstract contract StorageV1 {
    // TODO: Rename to `vsp`?
    IERC20 public token;

    // Means "BondData" or "LockData" or "DepositData" or "StakeData"
    struct Balance {
        uint256 lockedAmount; // VSP deposited
        uint256 boostedAmount; // based on the `lockPeriod`
        uint256 unlockTime; // now + `lockPeriod`
    }

    // Each RewardToken has its setup
    struct Reward {
        bool useBoost; // linear distribuition if false
        uint256 periodFinish;
        uint256 rewardRates; // a.k.a. speed (TODO: This mean that rate is predictable?)
        uint256 lastUpdateTime; // stores last drip (or reward deposit) time
        uint256 rewardPerTokenStored; // TODO: What this means?
    }

    // TODO: rename
    IVSPBond public bond; // nft contract

    // TODO: If they are read/readed toghether worh creating a 2 x uint128 struct
    uint256 public totalLocked; // VSP staked accumulator
    uint256 public totalBoosted; // boostedAmount accumulator

    // TODO: Move to `VSPBond` contract?
    uint256 public tokenId; // tokens counter

    // TODO: See if worth replace these with Enumarable
    /// Array of reward tokens
    address[] public rewardTokens;
    /// Reward token to valid/invalid flag mapping
    mapping(address => bool) public isRewardToken;

    // Bond => Balance
    mapping(uint256 => Balance) public balances;

    // TODO: If they are read/readed toghether worh creating a 2 x uint128 struct
    /// RewardToken => User => Reward per token stored at last reward update
    mapping(address => mapping(address => uint256)) public userRewardPerTokenPaid;
    /// RewardToken => User => Rewards earned till last reward update
    mapping(address => mapping(address => uint256)) public rewards;

    // RewardToken => Reward data
    mapping(address => Reward) public rewardData;

    // RewardToken -> distributor -> is approved to add rewards
    mapping(address => mapping(address => bool)) public isRewardDistributor;
}
