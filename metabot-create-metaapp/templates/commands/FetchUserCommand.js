/**
 * FetchUserCommand - Business Logic for fetching user information
 * 
 * Command Pattern implementation following IDFramework architecture.
 * 
 * This command:
 * 1. Uses UserDelegate to fetch user data (with IndexedDB caching)
 * 2. Updates the Model (user store) with user information
 * 
 * @class FetchUserCommand
 */
export default class FetchUserCommand {
  /**
   * Execute the command
   * 
   * Command execution flow:
   * 1. Extract metaid from payload
   * 2. Call UserDelegate to fetch user data (checks IndexedDB first, then API)
   * 3. Update Model (user store) with user information
   * 
   * @param {Object} params - Command parameters
   * @param {Object} params.payload - Event payload
   *   - metaid: {string} - MetaID to fetch user info for
   * @param {Object} params.stores - Alpine stores object
   *   - user: {Object} - User store (users, isLoading, error)
   * @param {Function} params.userDelegate - UserDelegate function (from IDFramework.Delegate.UserDelegate)
   * @returns {Promise<void>}
   */
  async execute({ payload = {}, stores, userDelegate }) {
    
    const userStore = stores.user;
    if (!userStore) {
      console.error('FetchUserCommand: User store not found');
      return;
    }

    const { metaid } = payload;
    if (!metaid) {
      console.error('FetchUserCommand: metaid is required');
      userStore.error = 'MetaID is required';
      return;
    }

    // Check if user already exists in store with the same metaid
    if (userStore.user && userStore.user.metaid === metaid) {
      return;
    }

    userStore.isLoading = true;
    userStore.error = null;

    try {
      // Use UserDelegate to fetch user data (with IndexedDB caching)
      if (!userDelegate) {
        throw new Error('UserDelegate is not available');
      }
      
      const userData = await userDelegate('metafs', `/info/metaid/${metaid}`, {
        metaid: metaid,
      });

      // Update Model: Store user data keyed by metaid
      userStore.user = userData;
      userStore.isLoading = false;
      userStore.error = null;
    
    } catch (error) {
      console.error('FetchUserCommand error:', error);
      userStore.error = error.message || 'Failed to fetch user information';
      userStore.isLoading = false;
    }
  }
}

