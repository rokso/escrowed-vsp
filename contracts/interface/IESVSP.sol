// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

interface IESVSP is IERC20, IERC20Metadata {
    /// Emitted after reward added
    event RewardAdded(address indexed rewardToken, uint256 reward, uint256 rewardDuration);
    /// Emitted whenever any user claim rewards
    event RewardPaid(address indexed user, address indexed rewardToken, uint256 reward);
    /// Emitted after adding new rewards token into rewardTokens array
    event RewardTokenAdded(address indexed rewardToken, address[] existingRewardTokens);
    /// Emitted when a new position is created (i.e. when user locks VSP)
    event VspLocked(uint256 tokenId, address account, uint256 amount, uint256 lockPeriod);
    /// Emitted when a position is burned (i.e. when user withdraws VSP)
    event VspWithdrawn(uint256 tokenId);
    /// Emitted when distributor approval is updated
    event RewardDistributorApprovalUpdated(address rewardsToken, address distributor, bool approved);
    /// Emitted when a position is kicked (i.e. when expired)
    event PositionKicked(uint256 tokenId);
    // Emitted when the exit penalty is updated
    event ExitPenaltyUpdated(uint256 oldExitPenalty, uint256 newExitPenalty);

    // TODO: add more events

    function addRewardToken(
        address rewardsToken_,
        address distributor_,
        bool isBoosted_
    ) external;

    function claimRewards(address account_) external;

    function claimableRewards(address account_)
        external
        view
        returns (address[] memory rewardTokens_, uint256[] memory claimableAmounts_);

    function lock(uint256 amount_, uint256 lockPeriod_) external;

    function notifyRewardAmount(address rewardToken_, uint256 rewardAmount_) external;

    function setRewardDistributorApproval(
        address rewardsToken_,
        address distributor_,
        bool approved_
    ) external;

    function updateReward(address account_) external;

    function updateExitPenalty(uint256 exitPenalty_) external;

    function withdraw(uint256 tokenId_, bool unexpired_) external;

    function kick(uint256 tokenId_) external;

    function kickAllExpiredOf(address account_) external;

    function lastTimeRewardApplicable(address _rewardToken) external view returns (uint256);

    function lockedBalanceOf(address account_) external view returns (uint256);

    function transferPosition(uint256 tokenId_, address to_) external;
}
