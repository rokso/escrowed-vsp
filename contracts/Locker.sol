// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "@openzeppelin/contracts/utils/Context.sol";
import "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import "./StorageV1.sol";

contract Locker is Initializable, StorageV1, Context {
    using SafeERC20 for IERC20;
    string public constant VERSION = "1.0.0";
    uint256 internal constant MINIMUM_LOCK_PERIOD = 7 days;
    uint256 internal constant MAXIMUM_LOCK_PERIOD = 2 * 365 days;
    uint256 internal constant MAXIMUM_BOOST = 4;

    function initialize(address _token, address _vspBond) public initializer {
        token = IERC20(_token);
        vspBond = VSPBond(_vspBond);
    }

    function lock(uint256 _amount, uint256 _lockPeriod) external {
       _lock(_amount, _lockPeriod, _msgSender());
    }

    function lockFor(uint256 _amount, uint256 _lockPeriod, address _account) public {
        _lock(_amount, _lockPeriod, _account);
    }

    function withdraw(uint256 _tokenId) external {
        _withdraw(_tokenId);
    }

    // TODO:
    function kickOff(uint256 _tokenId) external {}

    function _lock(uint256 _amount, uint256 _lockPeriod, address _account) internal {
        require(_amount > 0, "amount-zero");
        require(_lockPeriod > MINIMUM_LOCK_PERIOD, "lockPeriod < minimumLockPeriod");
        require(_lockPeriod < MAXIMUM_LOCK_PERIOD, "lockPeriod > maximumLockPeriod");
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(_msgSender(), address(this), _amount);
        uint256 _lockedAmount = token.balanceOf(address(this)) - balanceBefore;
        uint256 _boostedAmount = _amount * _lockPeriod * MAXIMUM_BOOST / MAXIMUM_LOCK_PERIOD;
        tokenId++;
        totalLocked += _lockedAmount;
        balances[tokenId] = Balance(_lockedAmount, _boostedAmount, block.timestamp + _lockPeriod);
        vspBond.mint(_account, tokenId);
    }

    function _withdraw(uint256 _tokenId) internal {
        Balance memory balance = balances[_tokenId];
        require(block.timestamp > balance.unlockTime, "not-unlocked-yet");
        require(balance.lockedAmount > 0, "no-balance");  // TODO: can remove this? 
        address _account = vspBond.ownerOf(_tokenId);
        vspBond.burn(tokenId);
        totalLocked -= balance.lockedAmount;
        token.safeTransfer(_account, balance.lockedAmount);
    }
}
