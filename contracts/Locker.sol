// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./access/Governable.sol";
import "./StorageV1.sol";

contract Locker is Governable, StorageV1 {
    using SafeERC20 for IERC20;
    string public constant VERSION = "1.0.0";
    IERC20 internal constant VSP = IERC20(0x1b40183EFB4Dd766f11bDa7A7c3AD8982e998421);
    uint256 internal constant MINIMUM_LOCK_PERIOD = 7 days;
    uint256 internal constant MAXIMUM_LOCK_PERIOD = 2 * 365 days;
    uint256 internal constant MAXIMUM_BOOST = 4;
    uint256 internal constant REWARD_DURATION = 30 days;

    event RewardAdded(address rewardToken, uint256 rewardAmount, uint256 rewardDuration);

    function initialize(IVSPBond bond_) public initializer {
        require(address(bond_) != address(0), "bond-is-zero");
        bond = bond_;
    }

    function lock(uint256 amount_, uint256 lockPeriod_) external {
        _lock(amount_, lockPeriod_, _msgSender());
    }

    function lockFor(
        uint256 amount_,
        uint256 lockPeriod_,
        address account_
    ) external {
        _lock(amount_, lockPeriod_, account_);
    }

    // TODO: Only governor
    function addReward(
        address rewardsToken_,
        address distributor_,
        bool isBoosted_
    ) public {
        require(rewardData[rewardsToken_].lastUpdateTime == 0);
        require(rewardsToken_ != address(VSP));
        rewardTokens.push(rewardsToken_);
        rewardData[rewardsToken_].lastUpdateTime = block.timestamp;
        rewardData[rewardsToken_].periodFinish = block.timestamp;
        rewardData[rewardsToken_].isBoosted = isBoosted_;
        isRewardDistributor[rewardsToken_][distributor_] = true;
    }

    function notifyRewardAmount(address rewardToken_, uint256 rewardAmount_) external {
        require(isRewardDistributor[rewardToken_][_msgSender()], "not-distributor");
        require(rewardAmount_ > 0, "incorrect-reward-amount");
        require(isRewardToken[rewardToken_], "invalid-reward-token");
        _notifyRewardAmount(rewardToken_, rewardAmount_);
    }

    // TODO: Merge with `notifyRewardAmount` if no other function call this
    function _notifyRewardAmount(address rewardToken_, uint256 rewardAmount_) internal {
        IERC20(rewardToken_).transferFrom(_msgSender(), address(this), rewardAmount_);
        Reward storage rewardData_ = rewardData[rewardToken_];
        uint256 totalSupply_ = rewardData_.isBoosted ? totalBoosted : totalLocked;
        rewardData_.rewardPerTokenStored = _rewardPerToken(rewardToken_, totalSupply_);
        if (block.timestamp >= rewardData_.periodFinish) {
            rewardData_.rewardRates = rewardAmount_ / REWARD_DURATION;
        } else {
            uint256 remainingPeriod_ = rewardData_.periodFinish - block.timestamp;
            uint256 leftover_ = remainingPeriod_ * rewardData_.rewardRates;
            rewardData_.rewardRates = (rewardAmount_ + leftover_) / REWARD_DURATION;
        }

        // Start new drip time
        rewardData_.lastUpdateTime = block.timestamp;
        rewardData_.periodFinish = block.timestamp + REWARD_DURATION;
        emit RewardAdded(rewardToken_, rewardAmount_, REWARD_DURATION);
    }

    function updateReward(address account_) external {
        require(account_ != address(0), "account-is-null");
        uint256 len_ = rewardTokens.length;
        uint256 totalSupply_;
        uint256 userBalance_;
        for (uint256 i = 0; i < len_; i++) {
            if (rewardData[rewardTokens[i]].isBoosted) {
                totalSupply_ = totalBoosted;
                userBalance_ = boosted[account_];
            } else {
                totalSupply_ = totalLocked;
                userBalance_ = locked[account_];
            }
            _updateReward(rewardTokens[i], account_, totalSupply_, userBalance_);
        }
    }

    function withdraw(uint256 tokenId_) external {
        _withdraw(tokenId_);
    }

    /// @notice Returns timestamp of last reward update
    function lastTimeRewardApplicable(address _rewardToken) public view returns (uint256) {
        uint256 periodFinish_ = rewardData[_rewardToken].periodFinish;
        return Math.min(block.timestamp, periodFinish_);
    }

    function _rewardPerToken(address rewardToken_, uint256 totalSupply_) internal view returns (uint256) {
        if (totalSupply_ == 0) {
            return rewardData[rewardToken_].rewardPerTokenStored;
        }

        uint256 timeSinceLastUpdate_ = lastTimeRewardApplicable(rewardToken_) - rewardData[rewardToken_].lastUpdateTime;
        uint256 rewardsSinceLastUpdate_ = timeSinceLastUpdate_ * rewardData[rewardToken_].rewardRates;
        uint256 rewardsPerTokenSinceLastUpdate_ = (rewardsSinceLastUpdate_ * 1e18) / totalSupply_;
        return rewardData[rewardToken_].rewardPerTokenStored + rewardsPerTokenSinceLastUpdate_;
    }

    function _lock(
        uint256 amount_,
        uint256 lockPeriod_,
        address account_
    ) internal {
        require(amount_ > 0, "amount-zero");
        require(lockPeriod_ > MINIMUM_LOCK_PERIOD, "lock-period-lt-minimum");
        require(lockPeriod_ <= MAXIMUM_LOCK_PERIOD, "lock-period-gt-maximum");

        uint256 balanceBefore_ = VSP.balanceOf(address(this));
        VSP.safeTransferFrom(_msgSender(), address(this), amount_);
        uint256 _lockedAmount = VSP.balanceOf(address(this)) - balanceBefore_;
        require(_lockedAmount > 0, "nothing-to-lock");

        uint256 _boostedAmount = (_lockedAmount * lockPeriod_ * MAXIMUM_BOOST) / MAXIMUM_LOCK_PERIOD;

        locked[account_] += _lockedAmount;
        boosted[account_] += _boostedAmount;
        totalLocked += _lockedAmount;
        totalBoosted += _boostedAmount;
        uint256 tokenId_ = bond.mint(account_);
        stakeData[tokenId_] = StakeData({
            lockedAmount: _lockedAmount,
            boostedAmount: _boostedAmount,
            unlockTime: block.timestamp + lockPeriod_
        });
    }

    function _claimable(
        address rewardToken_,
        address account_,
        uint256 totalSupply_,
        uint256 balance_
    ) private returns (uint256) {
        // TODO: WIP
    }

    function _updateReward(
        address rewardToken_,
        address account_,
        uint256 totalSupply_,
        uint256 balance_
    ) internal {
        uint256 _rewardPerTokenStored = _rewardPerToken(rewardToken_, totalSupply_);
        Reward storage rewardData_ = rewardData[rewardToken_];
        rewardData_.rewardPerTokenStored = _rewardPerTokenStored;
        rewardData_.lastUpdateTime = lastTimeRewardApplicable(rewardToken_);
        rewards[rewardToken_][account_] = _claimable(rewardToken_, account_, totalSupply_, balance_);
        userRewardPerTokenPaid[rewardToken_][account_] = _rewardPerTokenStored;
    }

    function _withdraw(uint256 tokenId_) internal {
        StakeData memory stakeData_ = stakeData[tokenId_];
        require(block.timestamp > stakeData_.unlockTime, "not-unlocked-yet");
        address account_ = bond.ownerOf(tokenId_);
        require(account_ == _msgSender(), "not-owner");
        bond.burn(tokenId_);
        totalLocked -= stakeData_.lockedAmount;
        totalBoosted -= stakeData_.boostedAmount;
        VSP.safeTransfer(account_, stakeData_.lockedAmount);
    }
}
