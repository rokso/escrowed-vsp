// Note: Draft
describe('Locker', function () {
  beforeEach('should lock VSP', async function () {})

  describe('lock', function () {
    it('should revert if amount is zero', async function () {})

    it('should revert if period is < min', async function () {})

    it('should revert if period is > max', async function () {})

    it('should lock VSP', async function () {})
  })

  // Note: Doesn't duplicate test cases from `lock()` because assumes the same implementation
  describe('lockFor', function () {
    it('should lock on behalf of other user', async function () {})
  })

  describe('withdraw', function () {
    beforeEach('should lock VSP', async function () {})

    it('should revert if caller is not the bond owner', async function () {})

    describe('without rewards', function () {
      describe('without boosted token', function () {
        it('should withdraw locked amount', async function () {})

        it('a whale should not dilute other users', async function () {})
      })

      describe('with boosted token', function () {
        it('should withdraw locked amount', async function () {})

        it('a whale should not dilute other users', async function () {})
      })
    })

    describe('with rewards', function () {
      describe('without boosted token', function () {
        it('should withdraw locked amount', async function () {})

        it('a whale should not dilute other users', async function () {})
      })

      describe('with boosted token', function () {
        it('should withdraw locked amount', async function () {})

        it('a whale should not dilute other users', async function () {})
      })
    })
  })

  describe('notifyRewardAmount', function () {
    it('should revert if not distributor', async function () {})

    it('should revert if amount is zero', async function () {})

    it('should revert if reward token is invalid', async function () {})

    it('should notify if now < period finish', async function () {})

    it('should notify if now >= period finish', async function () {})

    it('should notify when token is boosted', async function () {})

    it('should notify when token is not boosted', async function () {})
  })

  describe('addReward', function () {
    it('should revert if not governor', async function () {})

    it('should revert if reward token is VSP', async function () {})

    it('should revert if already added', async function () {})

    it('should add reward token', async function () {})
  })

  describe('updateReward', function () {
    it('should update if now < period finish', async function () {})

    it('should update if now >= period finish', async function () {})

    it('should update if user did not lock (???)', async function () {})
  })
})
