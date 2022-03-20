// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "./access/Governable.sol";
import "./StorageV1.sol";

contract Locker is Governable, StorageV1 {
    using SafeERC20 for IERC20;
    string public constant VERSION = "1.0.0";
    uint256 internal constant MINIMUM_LOCK_PERIOD = 7 days;
    uint256 internal constant MAXIMUM_LOCK_PERIOD = 2 * 365 days;
    uint256 internal constant MAXIMUM_BOOST = 4;
    uint256 internal constant REWARD_DURATION = 30 days; // TODO: What this means?

    event RewardAdded(address rewardToken, uint256 rewardAmount, uint256 rewardDuration);

    function initialize(IERC20 _token, IVSPBond _bond) public initializer {
        // TODO: add requires
        token = _token;
        bond = _bond;
    }

    function lock(uint256 _amount, uint256 _lockPeriod) external {
        _lock(_amount, _lockPeriod, _msgSender());
    }

    function lockFor(
        uint256 _amount,
        uint256 _lockPeriod,
        address _account
    ) external {
        _lock(_amount, _lockPeriod, _account);
    }

    // TODO: Who calls this function and when?
    function notifyRewardAmount(address _rewardToken, uint256 _rewardAmount) external {
        require(isRewardDistributor[_rewardToken][msg.sender], "not-distributor");
        require(_rewardAmount > 0, "incorrect-reward-amount");
        require(isRewardToken[_rewardToken], "invalid-reward-token");

        Reward storage _rewardData = rewardData[_rewardToken];

        // Update rewards earned so far
        uint256 _totalSupply; // TODO
        _rewardData.rewardPerTokenStored = _rewardPerToken(_rewardToken, _totalSupply);
        if (block.timestamp >= _rewardData.periodFinish) {
            _rewardData.rewardRates = _rewardAmount / REWARD_DURATION;
        } else {
            uint256 _remainingPeriod = _rewardData.periodFinish - block.timestamp;
            uint256 _leftover = _remainingPeriod * _rewardData.rewardRates;
            _rewardData.rewardRates = (_rewardAmount + _leftover) / REWARD_DURATION;
        }
        // Safety check
        uint256 balance = IERC20(_rewardToken).balanceOf(address(this));
        require(_rewardData.rewardRates <= (balance / REWARD_DURATION), "rewards-too-high");
        // Start new drip time

        // TODO: Commenting this since we have it as constant
        //rewardDuration[_rewardToken] = _rewardDuration;
        _rewardData.lastUpdateTime = block.timestamp;
        _rewardData.periodFinish = block.timestamp + REWARD_DURATION;
        emit RewardAdded(_rewardToken, _rewardAmount, REWARD_DURATION);
    }

    function updateReward(address _account) external {
        uint256 _totalBoosted = totalBoosted;
        // TODO: implement reward without boost
        uint256 _balance; // = IERC20(pool).balanceOf(_account);
        uint256 _len = rewardTokens.length;
        for (uint256 i = 0; i < _len; i++) {
            _updateReward(rewardTokens[i], _account, _totalBoosted, _balance);
        }
    }

    function withdraw(uint256 _tokenId) external {
        _withdraw(_tokenId);
    }

    function kickOff(uint256 _tokenId) external {
        // TODO
    }

    function lastTimeRewardApplicable(address _rewardToken) public returns (uint256) {
        // TODO
    }

    function _rewardPerToken(address _rewardToken, uint256 _totalSupply) private view returns (uint256) {
        // TODO
    }

    function _lock(
        uint256 _amount,
        uint256 _lockPeriod,
        address _account
    ) internal {
        require(_amount > 0, "amount-zero");
        require(_lockPeriod > MINIMUM_LOCK_PERIOD, "lockPeriod < minimumLockPeriod");
        require(_lockPeriod <= MAXIMUM_LOCK_PERIOD, "lockPeriod > maximumLockPeriod");

        uint256 _balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(_msgSender(), address(this), _amount);
        uint256 _lockedAmount = token.balanceOf(address(this)) - _balanceBefore;
        require(_lockedAmount > 0, "nothing-to-lock");

        uint256 _boostedAmount = (_lockedAmount * _lockPeriod * MAXIMUM_BOOST) / MAXIMUM_LOCK_PERIOD;

        tokenId++;
        totalLocked += _lockedAmount;
        totalBoosted += _boostedAmount;

        balances[tokenId] = Balance({
            lockedAmount: _lockedAmount,
            boostedAmount: _boostedAmount,
            unlockTime: block.timestamp + _lockPeriod
        });

        bond.mint(_account, tokenId);
    }

    function _claimable(
        address _rewardToken,
        address _account,
        uint256 _totalSupply,
        uint256 _balance
    ) private returns (uint256) {
        // TODO
    }

    function _updateReward(
        address _rewardToken,
        address _account,
        uint256 _totalSupply,
        uint256 _balance
    ) internal {
        uint256 _rewardPerTokenStored = _rewardPerToken(_rewardToken, _totalSupply);
        Reward storage _rewardData = rewardData[_rewardToken];
        _rewardData.rewardPerTokenStored = _rewardPerTokenStored;
        _rewardData.lastUpdateTime = lastTimeRewardApplicable(_rewardToken);
        if (_account != address(0)) {
            rewards[_rewardToken][_account] = _claimable(_rewardToken, _account, _totalSupply, _balance);
            userRewardPerTokenPaid[_rewardToken][_account] = _rewardPerTokenStored;
        }
    }

    function _withdraw(uint256 _tokenId) internal {
        Balance memory balance = balances[_tokenId];
        require(block.timestamp > balance.unlockTime, "not-unlocked-yet");
        address _account = bond.ownerOf(_tokenId);
        bond.burn(tokenId);
        totalLocked -= balance.lockedAmount;
        totalBoosted -= balance.boostedAmount;
        token.safeTransfer(_account, balance.lockedAmount);
    }
}
