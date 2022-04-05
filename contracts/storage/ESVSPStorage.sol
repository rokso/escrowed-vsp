// SPDX-License-Identifier: MIT

pragma solidity 0.8.9;

import "../interface/IESVSP.sol";
import "../interface/IESVSP721.sol";

abstract contract ESVSPStorageV1 is IESVSP {
    struct LockPosition {
        uint256 lockedAmount; // VSP locked
        uint256 boostedAmount; // based on the `lockPeriod`
        uint256 unlockTime; // now + `lockPeriod`
    }

    uint8 public decimals;
    string public name;
    string public symbol;
    IESVSP721 public esVSP721;
    IRewards public rewards;

    uint256 public override totalLocked; // VSP locked accumulator
    uint256 public override totalBoosted; // boostedAmount accumulator

    /**
     * @notice Fee paid when withdrawing. Decreases linearly as period finish approaches.
     * @dev Use 18 decimals (e.g. 0.5e18 is 50%)
     */
    uint256 public exitPenalty;

    // tokenId => locked
    mapping(uint256 => LockPosition) public positions;

    // user => total locked;
    mapping(address => uint256) public override locked;

    // user => total boosted;
    mapping(address => uint256) public override boosted;
}
