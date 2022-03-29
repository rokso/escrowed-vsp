// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/math/Math.sol";
import "./access/Governable.sol";
import "./StorageV1.sol";

// TODO: if user lock for some duration and do not withdraw from contract after expiry, it continue earn rewards on boosted amount.
// Need solution for this.
// Public should be able to call kick(user), kick(tokeId) method to remove expired lot from rewards. This remove boosted amount if locked time passed.
// When user interact with contract/claim rewards, update/boosted amount. Iterate all 721 owned by user and remove from list if expiry passed.

/**
 * @title Non-transferable escrowed VSP.
 */
contract ESVSP is Governable, StorageV1 {
    using SafeERC20 for IERC20;
    string public constant VERSION = "1.0.0";
    IERC20 public constant VSP = IERC20(0x1b40183EFB4Dd766f11bDa7A7c3AD8982e998421);
    uint256 public constant MINIMUM_LOCK_PERIOD = 7 days;
    uint256 public constant MAXIMUM_LOCK_PERIOD = 2 * 365 days;
    uint256 public constant MAXIMUM_BOOST = 4;
    uint256 public constant REWARD_DURATION = 30 days;

    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        IESVSP721 esVSP721_
    ) public initializer {
        require(address(esVSP721_) != address(0), "esVSP721-is-null");
        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        esVSP721 = esVSP721_;
    }

    /**
     * @notice add new reward token for distribution
     * @param rewardsToken_ Reward token address
     * @param distributor_  Authorized called to call notifyRewardAmount
     * @param isBoosted_ If reward token is boosted than rewards is distributed on boost amount depends on lock period
     */
    function addRewardToken(
        address rewardsToken_,
        address distributor_,
        bool isBoosted_
    ) external onlyGovernor {
        require(rewardData[rewardsToken_].lastUpdateTime == 0, "reward-already-added");
        rewardData[rewardsToken_] = Reward({
            isBoosted: isBoosted_,
            periodFinish: block.timestamp,
            rewardRates: 0,
            rewardPerTokenStored: 0,
            lastUpdateTime: block.timestamp
        });
        emit RewardTokenAdded(rewardsToken_, rewardTokens);
        rewardTokens.push(rewardsToken_);
        isRewardDistributor[rewardsToken_][distributor_] = true;
    }

    /**
     * @notice Claim earned rewards.
     * @dev This function will claim rewards for all tokens being rewarded
     */
    function claimRewards(address account_) external override {
        uint256 _len = rewardTokens.length;
        uint256 totalSupply_;
        uint256 userBalance_;
        for (uint256 i = 0; i < _len; i++) {
            address _rewardToken = rewardTokens[i];
            if (rewardData[_rewardToken].isBoosted) {
                totalSupply_ = totalBoosted;
                userBalance_ = boosted[account_];
            } else {
                totalSupply_ = totalLocked;
                userBalance_ = locked[account_];
            }
            _updateReward(_rewardToken, account_, totalSupply_, userBalance_);
            // Claim rewards
            uint256 _reward = rewards[_rewardToken][account_];
            _claimReward(_rewardToken, account_, _reward);
            emit RewardPaid(account_, _rewardToken, _reward);
        }
    }

    function claimableRewards(address account_)
        external
        view
        returns (address[] memory _rewardTokens, uint256[] memory _claimableAmounts)
    {
        uint256 _len = rewardTokens.length;
        uint256 totalSupply_;
        uint256 userBalance_;
        for (uint256 i = 0; i < _len; i++) {
            if (rewardData[rewardTokens[i]].isBoosted) {
                totalSupply_ = totalBoosted;
                userBalance_ = boosted[account_];
            } else {
                totalSupply_ = totalLocked;
                userBalance_ = locked[account_];
            }
            _claimableAmounts[i] = _claimable(rewardTokens[i], account_, totalSupply_, userBalance_);
        }
        _rewardTokens = rewardTokens;
    }

    /**
     * @notice Lock VSP to get boosted revenue and voting power. Lock VSP and generate users position by minting ERC721
     * @param amount_ .
     * @param lockPeriod_  Lock VSP
     */
    function lock(uint256 amount_, uint256 lockPeriod_) external override {
        updateReward(_msgSender());
        _lock(amount_, lockPeriod_, _msgSender());
    }

    /**
     * @notice Restricted method: Drip reward token and extend current reward duration by 30 days.
     * User get drip based on their boosted VSP amount
     * @param rewardToken_ Reward token address
     * @param rewardAmount_  Reward amount
     */
    function notifyRewardAmount(address rewardToken_, uint256 rewardAmount_) external override {
        require(isRewardDistributor[rewardToken_][_msgSender()], "not-distributor");
        require(rewardAmount_ > 0, "incorrect-reward-amount");
        // TODO: Check this line, seems that won't never reaches false because of the 1st require
        require(rewardData[rewardToken_].lastUpdateTime > 0, "reward-token-not-added");
        _notifyRewardAmount(rewardToken_, rewardAmount_);
    }

    // Modify approval for an address to call notifyRewardAmount
    function setRewardDistributorApproval(
        address rewardsToken_,
        address distributor_,
        bool approved_
    ) external onlyGovernor {
        require(rewardData[rewardsToken_].lastUpdateTime > 0, "reward-token-not-added");
        isRewardDistributor[rewardsToken_][distributor_] = approved_;
        emit RewardDistributorApprovalUpdated(rewardsToken_, distributor_, approved_);
    }

    /**
     * @notice Withdraw VSP by burning given ERC721 tokenId_
     * @param tokenId_ ERC721 tokenId
     */
    // TODO: Would make sense to have deposit/withdraw, lock/unlock or stake/unstake naming instead?
    function withdraw(uint256 tokenId_) external override {
        updateReward(_msgSender());
        _withdraw(tokenId_);
    }

    /**
     * @notice Update reward earning of user.
     * @param account_ .
     */
    function updateReward(address account_) public {
        uint256 _len = rewardTokens.length;
        uint256 _totalSupply;
        uint256 _userBalance;
        for (uint256 i = 0; i < _len; i++) {
            if (rewardData[rewardTokens[i]].isBoosted) {
                _totalSupply = totalBoosted;
                _userBalance = boosted[account_];
            } else {
                _totalSupply = totalLocked;
                _userBalance = locked[account_];
            }
            _updateReward(rewardTokens[i], account_, _totalSupply, _userBalance);
        }
    }

    function transferPosition(uint256 tokenId_, address to_) external {
        require(_msgSender() == address(esVSP721), "not-esvsp721");
        address _from = esVSP721.ownerOf(tokenId_);

        updateReward(_from);
        updateReward(to_);

        StakeData memory _stakeData = stakeData[tokenId_];
        uint256 _locked = _stakeData.lockedAmount;
        uint256 _boosted = _stakeData.boostedAmount;

        // TODO: Should these mappings live in NFT contract?
        // Pros: Since they represents lock positions same as NFT, it would increase code cohesion
        // Cons: Because they are mostly readed here, the external calls will increase gas cost
        locked[_from] -= _locked;
        boosted[_from] -= _boosted;
        locked[to_] += _locked;
        boosted[to_] += _boosted;
    }

    /**
     * @notice Get boosted VSP balance of user. This is different than ESVSP721.balanceOf()
     * It is sum of boosted amount of VSP in each ERC721 ( i.e. ESVSP721) token of user
     * @param account_ .
     * @return users boost VSP balance. Boost VSP > locked VSP
     */
    function balanceOf(address account_) public view override returns (uint256) {
        // TODO: We can rename `boosted` to `balanceOf` and get rid of this function
        return boosted[account_];
    }

    /// @notice Returns timestamp of last reward update
    function lastTimeRewardApplicable(address _rewardToken) public view returns (uint256) {
        return Math.min(block.timestamp, rewardData[_rewardToken].periodFinish);
    }

    /**
     * @notice Get total locked VSP balance of user.
     * It is sum of locked VSP in each ERC721 ( i.e. ESVSP721) token of user
     * @param account_ .
     * @return users locked VSP balance
     */
    function lockedBalanceOf(address account_) public view virtual override returns (uint256) {
        // TODO: We can rename `locked` to `lockedBalanceOf` and get rid of this function
        return locked[account_];
    }

    /**
     * @notice Total boosted amount.
     */
    function totalSupply() public view virtual override returns (uint256) {
        // TODO: We can rename `totalBoosted` to `totalSupply` and get rid of this function
        return totalBoosted;
    }

    function _claimReward(
        address rewardToken_,
        address account_,
        uint256 reward_
    ) internal virtual {
        // Mark reward as claimed
        rewards[rewardToken_][account_] = 0;
        // Transfer reward
        IERC20(rewardToken_).safeTransfer(account_, reward_);
    }

    function _notifyRewardAmount(address rewardToken_, uint256 rewardAmount_) internal {
        IERC20(rewardToken_).transferFrom(_msgSender(), address(this), rewardAmount_);
        Reward storage _rewardData = rewardData[rewardToken_];
        uint256 _totalSupply = _rewardData.isBoosted ? totalBoosted : totalLocked;
        _rewardData.rewardPerTokenStored = _rewardPerToken(rewardToken_, _totalSupply);
        if (block.timestamp >= _rewardData.periodFinish) {
            _rewardData.rewardRates = rewardAmount_ / REWARD_DURATION;
        } else {
            uint256 _remainingPeriod = _rewardData.periodFinish - block.timestamp;
            uint256 _leftover = _remainingPeriod * _rewardData.rewardRates;
            _rewardData.rewardRates = (rewardAmount_ + _leftover) / REWARD_DURATION;
        }

        // Start new drip time
        // TODO: Want we to use "drip" or "notify" naming?
        _rewardData.lastUpdateTime = block.timestamp;
        _rewardData.periodFinish = block.timestamp + REWARD_DURATION;
        emit RewardAdded(rewardToken_, rewardAmount_, REWARD_DURATION);
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
        if (account_ != address(0)) {
            rewards[rewardToken_][account_] = _claimable(rewardToken_, account_, totalSupply_, balance_);
            userRewardPerTokenPaid[rewardToken_][account_] = _rewardPerTokenStored;
        }
    }

    function _withdraw(uint256 tokenId_) internal {
        StakeData memory _stakeData = stakeData[tokenId_];
        require(block.timestamp > _stakeData.unlockTime, "not-unlocked-yet");

        address _account = esVSP721.ownerOf(tokenId_);
        uint256 _locked = _stakeData.lockedAmount;
        uint256 _boosted = _stakeData.boostedAmount;

        esVSP721.burn(tokenId_);
        delete stakeData[tokenId_];
        locked[_account] -= _locked;
        totalLocked -= _locked;
        boosted[_account] -= _boosted;
        totalBoosted -= _boosted;

        VSP.safeTransfer(_account, _locked);

        emit VspWithdrawn(tokenId_, _account, _locked);
    }

    function _claimable(
        address rewardToken_,
        address account_,
        uint256 totalSupply_,
        uint256 balance_
    ) internal view returns (uint256) {
        uint256 _rewardPerTokenAvailable = _rewardPerToken(rewardToken_, totalSupply_) -
            userRewardPerTokenPaid[rewardToken_][account_];
        uint256 _rewardsEarnedSinceLastUpdate = (balance_ * _rewardPerTokenAvailable) / 1e18;
        return rewards[rewardToken_][account_] + _rewardsEarnedSinceLastUpdate;
    }

    function _lock(
        uint256 amount_,
        uint256 lockPeriod_,
        address account_
    ) internal {
        require(amount_ > 0, "amount-is-zero");
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
        uint256 _tokenId = esVSP721.mint(account_);
        stakeData[_tokenId] = StakeData({
            lockedAmount: _lockedAmount,
            boostedAmount: _boostedAmount,
            unlockTime: block.timestamp + lockPeriod_
        });

        emit VspLocked(_tokenId, account_, amount_, lockPeriod_);
    }

    /// @notice Returns the reward per VSP locked based on time elapsed since last notification multiplied by reward rate
    function _rewardPerToken(address rewardToken_, uint256 totalSupply_) internal view returns (uint256) {
        if (totalSupply_ == 0) {
            // TODO: What will happen with the amount deposited when `totalSupply_` is 0?
            return rewardData[rewardToken_].rewardPerTokenStored;
        }

        uint256 _timeSinceLastUpdate = lastTimeRewardApplicable(rewardToken_) - rewardData[rewardToken_].lastUpdateTime;
        uint256 _rewardsSinceLastUpdate = _timeSinceLastUpdate * rewardData[rewardToken_].rewardRates;
        uint256 _rewardsPerTokenSinceLastUpdate = (_rewardsSinceLastUpdate * 1e18) / totalSupply_;
        return rewardData[rewardToken_].rewardPerTokenStored + _rewardsPerTokenSinceLastUpdate;
    }

    /** Methods not supported  */

    function allowance(
        address, /*owner*/
        address /*spender*/
    ) public view virtual override returns (uint256) {
        revert("allowance-not-supported");
    }

    function approve(
        address, /*spender*/
        uint256 /*amount*/
    ) public virtual override returns (bool) {
        revert("approval-not-supported");
    }

    function decreaseAllowance(
        address, /*spender*/
        uint256 /*subtractedValue*/
    ) public virtual returns (bool) {
        revert("allowance-not-supported");
    }

    function increaseAllowance(
        address, /*spender*/
        uint256 /*addedValue*/
    ) public virtual returns (bool) {
        revert("allowance-not-supported");
    }

    function transfer(
        address, /*recipient*/
        uint256 /*amount*/
    ) public virtual override returns (bool) {
        revert("transfer-not-supported");
    }

    function transferFrom(
        address, /*sender*/
        address, /*recipient*/
        uint256 /*amount*/
    ) public virtual override returns (bool) {
        revert("transfer-not-supported");
    }
}
