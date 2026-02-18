/**
 * FetchUserInfoCommand - Business Logic for fetching user information by metaid
 * 
 * Command Pattern implementation following IDFramework architecture.
 * 
 * This command:
 * 1. Uses UserDelegate to fetch user data (with IndexedDB caching)
 * 2. Returns user information including avatar, name, and metaid
 * 
 * @class FetchUserInfoCommand
 */
export default class FetchUserInfoCommand {
  /**
   * Execute the command
   * 
   * @param {Object} params - Command parameters
   * @param {Object} params.payload - Event payload
   *   - metaid: {string} - MetaID to fetch user info for
   * @param {Object} params.stores - Alpine stores object
   * @param {Function} params.userDelegate - UserDelegate function
   * @returns {Promise<Object>} User data with avatarUrl, name, metaid
   */
  async execute({ payload = {}, stores, userDelegate }) {
    try {
      const { metaid } = payload;

      if (!metaid) {
        throw new Error('metaid is required');
      }

      // Use UserDelegate to fetch user data (with IndexedDB caching)
      if (!userDelegate) {
        throw new Error('UserDelegate is not available');
      }

      const userData = await userDelegate('metafs', `/info/metaid/${metaid}`, {
        metaid: metaid,
      });

      // Return user data with required fields
      return {
        avatarUrl: userData.avatarUrl || userData.avatar || '',
        name: userData.name || '',
        metaid: userData.metaid || metaid
      };
    } catch (error) {
      console.error('FetchUserInfoCommand error:', error);
      throw error;
    }
  }
}
