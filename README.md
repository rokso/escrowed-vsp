# VSP Locker

This repository contains set of smart contracts and test cases of VSP Locker.
With these contracts, VSP holders may lock their tokens in order to boost voting power and rewards. The boost is proportional to the lock period.

## Setup

1. Install

   ```sh
   npm i
   ```

2. Set env vars

   Create the `.env` (use `.env.template` and `.github/env.properties` and as reference)

3. Test

   ```sh
   npm t
   ```

   or

   ```sh
   npm run coverage
   ```

4. Deploy & Verify

   ```sh
   npm run deploy -- --gasprice <gas price in wei> --network <network>
   npm run verify

   ```
