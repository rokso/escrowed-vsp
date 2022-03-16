# One Oracle

This repository contains set of smart contracts and test cases of One-Oracle. 
One-Oracle has wrapper contracts to query the price from third party price providers like Chainlink, Uniswap-V3, UniswapV2Like.
Price provider contract wrap third party price provider's oracle methods into common interface. UniswapV2Like price provider will provide outdated price if update() is not called in regular interval. 

## Setup

1. Install

   ```sh
   npm i
   ```

2. set NODE_URL in env

   ```sh
   export NODE_URL=<eth mainnet url>
   ```

   or by creating a `.env` file (use `.env.template` as reference)

3. Test

```sh
npm t
```

## Run test with coverage

```sh
npm run coverage
```
