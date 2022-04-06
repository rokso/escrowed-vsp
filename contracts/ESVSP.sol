// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/utils/math/SafeCast.sol";
import "./access/Governable.sol";
import "./storage/ESVSPStorage.sol";

/**
 * @title Non-transferable escrowed VSP.
 */
contract ESVSP is Governable, ESVSPStorageV1 {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    string public constant VERSION = "1.0.0";
    IERC20 public constant VSP = IERC20(0x1b40183EFB4Dd766f11bDa7A7c3AD8982e998421);
    uint256 public constant MINIMUM_LOCK_PERIOD = 7 days;
    uint256 public constant MAXIMUM_LOCK_PERIOD = 2 * 365 days;
    uint256 public constant MAXIMUM_BOOST = 4;

    function initialize(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        IESVSP721 esVSP721_
    ) public initializer {
        require(address(esVSP721_) != address(0), "esVSP721-is-null");

        __Governable_init();

        name = name_;
        symbol = symbol_;
        decimals = decimals_;
        esVSP721 = esVSP721_;
        exitPenalty = 0.5e18; // 50%;
    }

    /**
     * @notice Get boosted VSP balance of user. This is different than ESVSP721.balanceOf()
     * It is sum of boosted amount of VSP in each ERC721 (i.e. ESVSP721) token of user
     * @param account_ The account
     * @return user's boost VSP balance. Boost VSP > locked VSP
     */
    function balanceOf(address account_) public view override returns (uint256) {
        return boosted[account_];
    }

    /**
     * @notice Burn an expired position and send locked amount to the owner
     * @param tokenId_ ERC721 tokenId
     */
    function kick(uint256 tokenId_) external override {
        _updateReward(esVSP721.ownerOf(tokenId_));
        _kick(tokenId_);
    }

    /**
     * @notice Kick all expired positions from a given account
     * @param account_ The target account
     */
    function kickAllExpiredOf(address account_) external override {
        _updateReward(account_);
        _kickAllExpiredOf(account_);
    }

    /**
     * @notice Lock VSP to get boosted revenue and voting power. Lock VSP and generate users position by minting ERC721
     * @param amount_ The VSP amount to lock
     * @param lockPeriod_ The lock period
     */
    function lock(uint256 amount_, uint256 lockPeriod_) external override {
        _updateReward(_msgSender());
        _kickAllExpiredOf(_msgSender());
        _lock(amount_, lockPeriod_);
    }

    /**
     * @notice Get total locked VSP balance of user
     * It is sum of locked VSP in each ERC721 (i.e. ESVSP721) token of user
     * @param account_ The account
     * @return user's locked VSP balance
     */
    function lockedBalanceOf(address account_) public view virtual override returns (uint256) {
        return locked[account_];
    }

    /**
     * @notice Total boosted amount
     */
    function totalSupply() public view virtual override returns (uint256) {
        return totalBoosted;
    }

    /**
     * @notice Transfer position (i.e. locked and boosted amounts) between accounts
     * @dev Revert if caller isn't the esVSP721 contract
     * @param tokenId_ The position (NFT) to transfer
     * @param to_ The recipient
     */
    function transferPosition(uint256 tokenId_, address to_) external {
        require(_msgSender() == address(esVSP721), "not-esvsp721");
        address _from = esVSP721.ownerOf(tokenId_);

        _updateReward(_from);
        _updateReward(to_);

        LockPosition memory _position = positions[tokenId_];
        uint256 _locked = _position.lockedAmount;
        uint256 _boosted = _position.boostedAmount;

        locked[_from] -= _locked;
        boosted[_from] -= _boosted;
        locked[to_] += _locked;
        boosted[to_] += _boosted;
    }

    /**
     * @notice Unlock VSP by burning given ERC721 tokenId_
     * @param tokenId_ ERC721 tokenId
     * @param beforeUnlockTime_ When `true` unlock before expiration and pays exit penalty
     */
    function unlock(uint256 tokenId_, bool beforeUnlockTime_) external override {
        _updateReward(_msgSender());
        _unlock(tokenId_, !beforeUnlockTime_);
        _kickAllExpiredOf(_msgSender());
    }

    /**
     * @notice Burn given position and transfer locked amount to the owner (charges penalty if aplicable)
     * @param tokenId_ The id of the position (NFT)
     * @param onlyIfExpired_ When `true` revert if did't reach unlockTime
     */
    function _burn(
        uint256 tokenId_,
        bool onlyIfExpired_,
        address _account
    ) internal {
        LockPosition memory _position = positions[tokenId_];
        uint256 _unlockTime = _position.unlockTime;

        if (onlyIfExpired_) {
            require(block.timestamp > _unlockTime, "not-unlocked-yet");
        }

        uint256 _locked = _position.lockedAmount;
        uint256 _boosted = _position.boostedAmount;

        esVSP721.burn(tokenId_);
        delete positions[tokenId_];

        locked[_account] -= _locked;
        totalLocked -= _locked;
        boosted[_account] -= _boosted;
        totalBoosted -= _boosted;

        uint256 _toTransfer = _locked;

        if (block.timestamp <= _unlockTime) {
            uint256 _lockPeriod = (_boosted * MAXIMUM_LOCK_PERIOD) / MAXIMUM_BOOST / _locked;
            uint256 _progress = ((_unlockTime - block.timestamp) * 1e18) / _lockPeriod;
            uint256 _penalty = (((_locked * exitPenalty) / 1e18) * _progress) / 1e18;
            _toTransfer -= _penalty;
        }

        VSP.safeTransfer(_account, _toTransfer);
    }

    /**
     * @notice Kick all expired positions of a user
     * @param account_ The target account
     */
    function _kickAllExpiredOf(address account_) internal {
        uint256 _len = esVSP721.balanceOf(account_);
        uint256[] memory _toKick = new uint256[](_len);

        for (uint256 i = 0; i < _len; ++i) {
            uint256 _tokenId = esVSP721.tokenOfOwnerByIndex(account_, i);
            if (block.timestamp > positions[_tokenId].unlockTime) {
                _toKick[i] = _tokenId;
            }
        }

        for (uint256 i = 0; i < _len; ++i) {
            uint256 _tokenId = _toKick[i];
            if (_tokenId > 0) {
                _kick(_tokenId);
            }
        }
    }

    /**
     * @notice Burn an expired position and send locked amount to the owner
     * @param tokenId_ ERC721 tokenId
     */
    function _kick(uint256 tokenId_) internal {
        address _account = esVSP721.ownerOf(tokenId_);

        _burn(tokenId_, true, _account);

        emit PositionKicked(tokenId_);
    }

    /**
     * @notice Lock VSP to get boosted revenue and voting power. Lock VSP and generate users position by minting ERC721
     * @param amount_ The VSP amount to lock
     * @param lockPeriod_ The lock period
     */
    function _lock(uint256 amount_, uint256 lockPeriod_) internal {
        require(amount_ > 0, "amount-is-zero");
        require(lockPeriod_ > MINIMUM_LOCK_PERIOD, "lock-period-lt-minimum");
        require(lockPeriod_ <= MAXIMUM_LOCK_PERIOD, "lock-period-gt-maximum");

        address account_ = _msgSender();

        uint256 balanceBefore_ = VSP.balanceOf(address(this));
        VSP.safeTransferFrom(account_, address(this), amount_);
        uint256 _lockedAmount = VSP.balanceOf(address(this)) - balanceBefore_;
        require(_lockedAmount > 0, "nothing-to-lock");

        uint256 _boostedAmount = (_lockedAmount * lockPeriod_ * MAXIMUM_BOOST) / MAXIMUM_LOCK_PERIOD;

        locked[account_] += _lockedAmount;
        boosted[account_] += _boostedAmount;
        totalLocked += _lockedAmount;
        totalBoosted += _boostedAmount;

        uint256 _tokenId = esVSP721.mint(account_);

        positions[_tokenId] = LockPosition({
            lockedAmount: _lockedAmount,
            boostedAmount: _boostedAmount,
            unlockTime: block.timestamp + lockPeriod_
        });

        emit VspLocked(_tokenId, account_, amount_, lockPeriod_);
    }

    /**
     * @notice Unlock VSP by burning given ERC721 tokenId_
     * @param tokenId_ ERC721 tokenId
     */
    function _unlock(uint256 tokenId_, bool onlyIfExpired_) internal {
        address _account = esVSP721.ownerOf(tokenId_);
        require(_msgSender() == _account, "not-position-owner");

        _burn(tokenId_, onlyIfExpired_, _account);

        emit VspUnlocked(tokenId_);
    }

    /**
     * @notice Update related rewards
     * @param account_ The account to update
     */
    function _updateReward(address account_) private {
        if (address(rewards) != address(0)) {
            rewards.updateReward(account_);
        }
    }

    /** Governance methods **/

    /**
     * @notice Set the Rewards contract
     * @param rewards_ The new contract
     */
    function setRewards(IRewards rewards_) external onlyGovernor {
        require(address(rewards_) != address(0), "address-is-null");
        require(address(rewards_) != address(rewards), "same-as-current");
        emit RewardsUpdated(rewards, rewards_);
        rewards = rewards_;
    }

    /**
     * @notice Update exit penalty
     * @param exitPenalty_ The new exit penalty
     */
    function updateExitPenalty(uint256 exitPenalty_) external onlyGovernor {
        require(exitPenalty_ <= 1e18, "exit-fee-gt-100%");
        require(exitPenalty_ != exitPenalty, "fee-is-same-as-current");
        emit ExitPenaltyUpdated(exitPenalty, exitPenalty_);
        exitPenalty = exitPenalty_;
    }

    /** Methods not supported **/

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
