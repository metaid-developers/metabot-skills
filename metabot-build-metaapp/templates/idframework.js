/**
 * IDFramework - Core Framework for MetaWeb Applications
 * 
 * A lightweight, decentralized SPA framework following Cairngorm MVC philosophy.
 * Designed for MetaID Protocol-based blockchain internet applications.
 * 
 * Core Philosophy:
 * - Single Source of Truth: All application state in global singleton Model layer
 * - View is "Dumb": Views only display data and dispatch events
 * - Command Pattern: Business logic atomized into independent Commands
 * - Separation of Concerns: View, Model, Command, Delegate strictly separated
 * - Event-Driven: Components communicate through events, not direct calls
 * 
 * Data Flow:
 * View -> Event -> IDController -> Command -> BusinessDelegate (Service) -> Model -> View (Binding)
 * 
 * @namespace IDFramework
 */

class IDFramework {
  /**
   * ============================================
   * MODEL LAYER - Single Source of Truth
   * ============================================
   * 
   * The Model layer provides a global singleton store for all application state.
   * It includes built-in models (wallet, app) and allows dynamic model registration.
   * All models are managed through Alpine.js stores for reactive updates.
   */

  /**
   * Initialize Model Layer with built-in models
   * 
   * Built-in Models:
   * - wallet: User wallet information and connection status
   * - app: Application-level global state
   * 
   * Additional models can be registered dynamically via Alpine.store()
   * 
   * Note: This method will NOT overwrite existing stores. If a store already exists,
   * it will be preserved. This allows stores to be registered in index.html
   * before the framework loads, ensuring they're available when Alpine processes the DOM.
   * 
   * @param {Object} customModels - Optional custom models to register
   * @example
   * IDFramework.initModels({
   *   user: { name: '', email: '' },
   *   settings: { theme: 'light' }
   * });
   */
  static initModels(customModels = {}) {
    if (typeof Alpine === 'undefined') {
      throw new Error('Alpine.js is not loaded. Please include Alpine.js before initializing IDFramework.');
    }

    // Built-in Wallet Model
    // Only register if it doesn't already exist (to preserve any existing state)
    if (!Alpine.store('wallet')) {
      Alpine.store('wallet', {
        isConnected: false,
        address: null,
        metaid: null,
        globalMetaId: null, // GlobalMetaID for cross-chain identity
        globalMetaIdInfo: null, // Full GlobalMetaID info (mvc, btc, doge)
        publicKey: null,
        network: null, // 'mainnet' | 'testnet'
      });
    }

    // Built-in App Model
    // Only register if it doesn't already exist (to preserve any existing state)
    if (!Alpine.store('app')) {
      Alpine.store('app', {
        isLogin: false,
        userAddress: null,
        // Additional app-level state can be added here
      });
    }

    // Register custom models if provided
    // Only register if they don't already exist
    Object.keys(customModels).forEach(modelName => {
      if (!Alpine.store(modelName)) {
        Alpine.store(modelName, customModels[modelName]);
      }
    });
  }

  /**
   * ============================================
   * DELEGATE LAYER - Service Abstraction
   * ============================================
   * 
   * Delegate layer abstracts the complexity of remote service communication.
   * It handles API calls, error handling, and returns raw data to Commands.
   * Commands use DataAdapters to transform raw data into Model format.
   * 
   * The Delegate object contains multiple delegate methods for different purposes:
   * - BusinessDelegate: Generic API communication handler
   * - UserDelegate: User-related API calls (e.g., avatar, profile)
   */

  /**
   * Delegate - Service abstraction object
   * 
   * Contains various delegate methods for different types of service communication.
   */
  static Delegate = {
    /**
     * BusinessDelegate - Generic API communication handler
     * 
     * This method abstracts service communication, allowing Commands to focus on business logic
     * rather than HTTP details. It uses ServiceLocator to resolve service base URLs.
     * 
     * @param {string} serviceKey - Key to look up BaseURL from ServiceLocator (e.g., 'metaid_man')
     * @param {string} endpoint - API endpoint path (e.g., '/pin/path/list')
     * @param {Object} options - Fetch options (method, headers, body, etc.)
     * @returns {Promise<Object>} Raw JSON response from the service
     * 
     * @example
     * const data = await IDFramework.Delegate.BusinessDelegate('metaid_man', '/pin/path/list', {
     *   method: 'GET',
     *   headers: { 'Authorization': 'Bearer token' }
     * });
     */
    async BusinessDelegate(serviceKey, endpoint, options = {}) {
      // Validate ServiceLocator exists
      if (!window.ServiceLocator || !window.ServiceLocator[serviceKey]) {
        throw new Error(`Service '${serviceKey}' not found in ServiceLocator. Please define it in app.js`);
      }

      const baseURL = window.ServiceLocator[serviceKey];
      const url = `${baseURL}${endpoint}`;

      // Default fetch options
      const defaultOptions = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...options.headers,
        },
      };

      const fetchOptions = { ...defaultOptions, ...options };

      try {
        const response = await fetch(url, fetchOptions);
        
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        return data;
      } catch (error) {
        console.error(`BusinessDelegate error for ${serviceKey}${endpoint}:`, error);
        throw error;
      }
    },

    /**
     * UserDelegate - User-related API communication handler with IndexedDB caching
     * 
     * This method handles user-related API calls, such as fetching user avatar,
     * profile information, etc. from remote services.
     * 
     * It implements a cache-first strategy:
     * 1. Check IndexedDB for cached user data
     * 2. If found, return cached data
     * 3. If not found, fetch from remote API and cache in IndexedDB
     * 
     * @param {string} serviceKey - Key to look up BaseURL from ServiceLocator (e.g., 'metafs')
     * @param {string} endpoint - API endpoint path (e.g., '/info/metaid/xxx')
     * @param {Object} options - Fetch options (method, headers, body, etc.)
     * @param {string} options.metaid - MetaID to fetch user info for (required)
     * @returns {Promise<Object>} User data object with avatar image
     * 
     * @example
     * const userData = await IDFramework.Delegate.UserDelegate('metafs', '/info/metaid/xxx', {
     *   metaid: '4091a83e631ef80ad55088c80e22e58747671a288aa64441f34d91f5c87532bb'
     * });
     */
    async UserDelegate(serviceKey, endpoint, options = {}) {
      // Extract metaid from options or from endpoint
      let metaid = options.metaid;
      
      // If metaid not in options, try to extract from endpoint
      if (!metaid && endpoint) {
        const match = endpoint.match(/\/info\/metaid\/([^\/]+)/);
        if (match) {
          metaid = match[1];
        }
      }
      
      if (!metaid) {
        throw new Error('UserDelegate: metaid is required (provide in options.metaid or endpoint)');
      }

      // Step 1: Check IndexedDB for cached user data
      try {
        const cachedUser = await this._getUserFromIndexedDB(metaid);
        if (cachedUser) {
          // If cached user has old avatarImg but no avatarUrl, update it
          if (cachedUser.avatarImg && !cachedUser.avatarUrl) {
            // Old format - need to rebuild avatarUrl from avatar or avatarId
            if (cachedUser.avatarId) {
              cachedUser.avatarUrl = `${window.ServiceLocator[serviceKey]}/v1/users/avatar/accelerate/${cachedUser.avatarId}`;
            } else if (cachedUser.avatar) {
              const avatarFileName = cachedUser.avatar.split('/').pop();
              if (avatarFileName) {
                cachedUser.avatarUrl = `${window.ServiceLocator[serviceKey]}/v1/users/avatar/accelerate/${avatarFileName}`;
              }
            }
            // Remove old avatarImg field
            delete cachedUser.avatarImg;
            // Update cache
            await this._saveUserToIndexedDB(cachedUser);
          }
          // Also check if avatarUrl is missing but we have avatar or avatarId (for cached entries without avatarUrl)
          if (!cachedUser.avatarUrl && (cachedUser.avatarId || cachedUser.avatar)) {
            if (cachedUser.avatarId) {
              cachedUser.avatarUrl = `${window.ServiceLocator[serviceKey]}/v1/users/avatar/accelerate/${cachedUser.avatarId}`;
            } else if (cachedUser.avatar) {
              const avatarFileName = cachedUser.avatar.split('/').pop();
              if (avatarFileName) {
                cachedUser.avatarUrl = `${window.ServiceLocator[serviceKey]}/v1/users/avatar/accelerate/${avatarFileName}`;
              }
            }
            // Update cache
            await this._saveUserToIndexedDB(cachedUser);
          }
          return cachedUser;
        }
      } catch (error) {
        console.warn('UserDelegate: Error reading from IndexedDB:', error);
        // Continue to fetch from API
      }

      // Step 2: Fetch from remote API
      if (!window.ServiceLocator || !window.ServiceLocator[serviceKey]) {
        throw new Error(`Service '${serviceKey}' not found in ServiceLocator. Please define it in app.js`);
      }

      const baseURL = window.ServiceLocator[serviceKey];
      // Use provided endpoint or construct default endpoint
      const finalEndpoint = endpoint || `/info/metaid/${metaid}`;
      const url = `${baseURL}${finalEndpoint}`;

      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const userData = await response.json();

        // Extract user info from API response
        if (userData.code === 1 && userData.data) {
          const userInfo = userData.data;
          
          // Step 3: Store avatar URL (not base64) to avoid CORS issues
          // We'll use the URL directly in <img> tags, which don't have CORS restrictions
          // Example correct URL: https://file.metaid.io/metafile-indexer/api/v1/users/avatar/accelerate/dc5284fc2ea18067a3a2f8e50c41825e11c27a71b9574a38ac92d889841e1bc6i0
          let avatarUrl = null;
          
          // Check for avatarId first, then fallback to extracting from avatar path
          if (userInfo.avatarId) {
            // Use the accelerate endpoint URL directly
            avatarUrl = `${baseURL}/v1/users/avatar/accelerate/${userInfo.avatarId}`;
          } else if (userInfo.avatar) {
            // Extract avatar ID from avatar path
            // Example: '/content/c01608381d41661448c5212a4a14282b42d8f46bd257caaa01cd8e2bdd342dd2i0'
            // We need to extract: 'c01608381d41661448c5212a4a14282b42d8f46bd257caaa01cd8e2bdd342dd2i0'
            const avatarPath = userInfo.avatar;
            // Extract the filename part (everything after the last '/')
            const avatarFileName = avatarPath.split('/').pop();
            if (avatarFileName) {
              avatarUrl = `${baseURL}/v1/users/avatar/accelerate/${avatarFileName}`;
            } else {
              console.warn(`UserDelegate: Could not extract filename from avatar path: ${avatarPath}`);
            }
          }

            // Step 4: Prepare user object for storage
            const userObject = {
              globalMetaId: userInfo.globalMetaId || '',
              metaid: userInfo.metaid || metaid,
              name: userInfo.name || '',
              nameId:userInfo.nameId ||'',
              address: userInfo.address || '',
              avatar: userInfo.avatar || '',
              avatarId: userInfo.avatarId || '',
              chatpubkey: userInfo.chatpubkey || '',
              chatpubkeyId: userInfo.chatpubkeyId || '',
              avatarUrl: avatarUrl, // Avatar image URL (not base64, to avoid CORS)
            };

          // Step 5: Store in IndexedDB
          try {
            await this._saveUserToIndexedDB(userObject);
          } catch (error) {
            console.warn('UserDelegate: Error saving to IndexedDB:', error);
            // Continue anyway - return the data even if caching fails
          }

          return userObject;
        } else {
          throw new Error(`API returned error: ${userData.message || 'Unknown error'}`);
        }
      } catch (error) {
        console.error(`UserDelegate error for ${serviceKey}${endpoint}:`, error);
        throw error;
      }
    },

    /**
     * Initialize IndexedDB for user data storage
     * @returns {Promise<IDBDatabase>} IndexedDB database instance
     */
    async _initIndexedDB() {
      return new Promise((resolve, reject) => {
        const request = indexedDB.open('idframework-user-db', 1);

        request.onerror = () => {
          reject(new Error('Failed to open IndexedDB'));
        };

        request.onsuccess = () => {
          resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
          const db = event.target.result;
          
          // Create User object store if it doesn't exist
          if (!db.objectStoreNames.contains('User')) {
            const objectStore = db.createObjectStore('User', { keyPath: 'metaid' });
            // Create index for faster lookups
            objectStore.createIndex('globalMetaId', 'globalMetaId', { unique: false });
          }
        };
      });
    },

    /**
     * Get user data from IndexedDB
     * @param {string} metaid - MetaID to look up
     * @returns {Promise<Object|null>} User data or null if not found
     */
    async _getUserFromIndexedDB(metaid) {
      try {
        const db = await this._initIndexedDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(['User'], 'readonly');
          const objectStore = transaction.objectStore('User');
          const request = objectStore.get(metaid);

          request.onsuccess = () => {
            resolve(request.result || null);
          };

          request.onerror = () => {
            reject(new Error('Failed to read from IndexedDB'));
          };
        });
      } catch (error) {
        console.error('_getUserFromIndexedDB error:', error);
        return null;
      }
    },

    /**
     * Save user data to IndexedDB
     * @param {Object} userData - User data object
     * @returns {Promise<void>}
     */
    async _saveUserToIndexedDB(userData) {
      try {
        const db = await this._initIndexedDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(['User'], 'readwrite');
          const objectStore = transaction.objectStore('User');
          
          // Check for existing entry to potentially update its structure
          const getRequest = objectStore.get(userData.metaid);
          getRequest.onsuccess = async () => {
            let existingUser = getRequest.result;
            let userToStore = { ...userData }; // Start with new object

            if (existingUser) {
              // If old entry has avatarImg but not avatarUrl, migrate it
              if (existingUser.avatarImg && !existingUser.avatarUrl && userData.avatarUrl) {
                userToStore.avatarUrl = userData.avatarUrl;
                delete userToStore.avatarImg; // Remove old field
              }
              // Merge existing data with new data, prioritizing new data
              userToStore = { ...existingUser, ...userToStore };
            }

            const putRequest = objectStore.put(userToStore); // Use put to add or update

            putRequest.onerror = () => {
              reject(new Error('Failed to save to IndexedDB'));
            };

            putRequest.onsuccess = () => {
              resolve();
            };
          };
          getRequest.onerror = () => {
            reject(new Error('Error checking existing user in IndexedDB'));
          };
        });
      } catch (error) {
        console.error('_saveUserToIndexedDB error:', error);
        throw error;
      }
    },

    /**
     * Clear all cached user data from IndexedDB
     * This is useful for debugging or when cache structure changes
     * Usage: IDFramework.Delegate.UserDelegate.clearUserCache()
     */
    async clearUserCache() {
      try {
        const db = await this._initIndexedDB();
        return new Promise((resolve, reject) => {
          const transaction = db.transaction(['User'], 'readwrite');
          const objectStore = transaction.objectStore('User');
          const request = objectStore.clear();

          request.onerror = () => {
            reject(new Error('Error clearing user cache from IndexedDB'));
          };

          request.onsuccess = () => {
            resolve();
          };
        });
      } catch (error) {
        console.error('clearUserCache error:', error);
        throw error;
      }
    },

    /**
     * Convert Blob to Data URL (Base64)
     * @param {Blob} blob - Blob to convert
     * @returns {Promise<string>} Data URL string
     */
    async _blobToDataURL(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    },
  };

  /**
   * ============================================
   * CONTROLLER LAYER - Event to Command Mapping
   * ============================================
   * 
   * IDController maps events to Commands with async lazy loading.
   * This allows Commands to be loaded on-demand, reducing initial bundle size.
   * 
   * Built-in Commands:
   * - connectWallet: Connect to Metalet wallet
   * - createPIN: Create and broadcast a PIN to the blockchain (mock implementation)
   */

  /**
   * IDController - Maps Events to Commands
   * 
   * The controller maintains a registry of event-to-command mappings.
   * Commands are lazy-loaded when events are dispatched, enabling code splitting.
   */
  static IDController = {
    /**
     * Command registry: Map of event names to command module paths
     * @type {Map<string, string>}
     */
    commands: new Map(),

    /**
     * Built-in command registry for framework-provided commands
     * @type {Map<string, Function>}
     */
    builtInCommands: new Map(),

    /**
     * Register a command for an event
     * 
     * Commands can be:
     * - File paths (e.g., './commands/FetchBuzzCommand.js') - will be lazy-loaded
     * - Built-in command functions (registered via registerBuiltIn)
     * 
     * @param {string} eventName - Event name (e.g., 'fetchBuzz', 'postBuzz')
     * @param {string|Function} commandPathOrFunction - Path to command module or built-in command function
     * 
     * @example
     * // Register a file-based command
     * IDFramework.IDController.register('fetchBuzz', './commands/FetchBuzzCommand.js');
     * 
     * @example
     * // Register a built-in command
     * IDFramework.IDController.registerBuiltIn('connectWallet', IDFramework.BuiltInCommands.connectWallet);
     */
    register(eventName, commandPathOrFunction) {
      if (typeof commandPathOrFunction === 'function') {
        this.builtInCommands.set(eventName, commandPathOrFunction);
      } else {
        this.commands.set(eventName, commandPathOrFunction);
      }
    },

    /**
     * Register a built-in command function
     * 
     * @param {string} eventName - Event name
     * @param {Function} commandFunction - Command function
     */
    registerBuiltIn(eventName, commandFunction) {
      this.builtInCommands.set(eventName, commandFunction);
    },

    /**
     * Execute a command for an event
     * 
     * This method:
     * 1. Looks up the command for the event
     * 2. Lazy-loads file-based commands or uses built-in commands
     * 3. Instantiates and executes the command
     * 4. Passes BusinessDelegate and relevant stores to the command
     * 
     * @param {string} eventName - Event name to execute
     * @param {Object} payload - Event payload data
     * @param {Object} stores - Object containing relevant Alpine stores (optional, auto-resolved if not provided)
     * @returns {Promise<void>}
     * 
     * @example
     * await IDFramework.IDController.execute('fetchBuzz', { cursor: 0, size: 30 });
     */
    async execute(eventName, payload = {}, stores = null) {
        
      // Check built-in commands first
      const builtInCommand = this.builtInCommands.get(eventName);
      if (builtInCommand) {
        try {
          // Resolve stores if not provided
          if (!stores) {
            stores = {
              wallet: Alpine.store('wallet'),
              app: Alpine.store('app'),
            };
          }
          
          await builtInCommand({
            payload,
            stores,
            delegate: IDFramework.Delegate.BusinessDelegate.bind(IDFramework.Delegate),
            userDelegate: IDFramework.Delegate.UserDelegate.bind(IDFramework.Delegate),
          });
          return;
        } catch (error) {
          console.error(`Error executing built-in command '${eventName}':`, error);
          throw error;
        }
      }

      // Check file-based commands
      const commandPath = this.commands.get(eventName);
      
      if (!commandPath) {
        console.warn(`No command registered for event: ${eventName}`);
        return;
      }

      // Validate commandPath is a valid string
      if (typeof commandPath !== 'string' || !commandPath.trim()) {
        console.error(`Invalid command path for event '${eventName}': ${commandPath}`);
        return;
      }
      
      try {
        // Lazy load the command module
        const CommandModule = await import(commandPath);
        const CommandClass = CommandModule.default || CommandModule[Object.keys(CommandModule)[0]];
        
        if (!CommandClass) {
          throw new Error(`Command class not found in ${commandPath}`);
        }

        const command = new CommandClass();
        
        // Resolve stores if not provided
        // Include all registered stores (wallet, app, buzz, user, chat, etc.)
        if (!stores) {
          stores = {
            wallet: Alpine.store('wallet'),
            app: Alpine.store('app'),
            user: Alpine.store('user'),
            
          };
        }
        
        // Execute command with Delegate and stores
        // Commands can use either BusinessDelegate or UserDelegate
        // Bind UserDelegate to Delegate object to ensure 'this' context is correct
        await command.execute({
          payload,
          stores,
          delegate: IDFramework.Delegate.BusinessDelegate.bind(IDFramework.Delegate),
          userDelegate: IDFramework.Delegate.UserDelegate.bind(IDFramework.Delegate),
        });
      } catch (error) {
        console.error(`Error executing command for event '${eventName}':`, error);
        throw error;
      }
    },
  };

  /**
   * ============================================
   * BUILT-IN COMMANDS
   * ============================================
   * 
   * Framework-provided commands for common MetaID operations.
   * These can be used directly or extended by applications.
   */

  /**
   * Built-in Commands collection
   */
  static BuiltInCommands = {
    /**
     * ConnectWalletCommand - Connect to Metalet wallet
     * 
     * Updates the wallet store with connection status and user information.
     * 
     * @param {Object} params - Command parameters
     * @param {Object} params.stores - Alpine stores (wallet, app)
     * @returns {Promise<void>}
     */
    async connectWallet({ stores }) {
      if (!window.metaidwallet) {
        throw new Error('Metalet wallet is not installed. Please install Metalet extension first.');
      }

      try {
        const result = await window.metaidwallet.connect();
        
        if (result && result.address) {
          // Update wallet store
          stores.wallet.isConnected = true;
          stores.wallet.address = result.address;
          
          // Try to get additional wallet info
          try {
            // stores.wallet.metaid = result.metaid || result.address;
            stores.wallet.publicKey = await window.metaidwallet.getPublicKey();
             const network = await window.metaidwallet.getNetwork();
             if(network){
                     stores.wallet.network=network.network
             }else{
                stores.wallet.network='mainnet'
             }
            
            // Get GlobalMetaID for cross-chain identity
            try {
              const globalMetaIdResult = await window.metaidwallet.getGlobalMetaid();
              
              if (globalMetaIdResult && globalMetaIdResult.mvc) {
                
                stores.wallet.globalMetaId = globalMetaIdResult.mvc.globalMetaId;
                stores.wallet.globalMetaIdInfo = globalMetaIdResult; // Store full info (mvc, btc, doge)
              }
            } catch (e) {
              console.warn('Failed to get GlobalMetaID:', e);
            }
          } catch (e) {
            console.warn('Failed to get additional wallet info:', e);
          }

          // Update app store
          stores.app.isLogin = true;
          stores.app.userAddress = result.address;
        }
      } catch (error) {
        console.error('Failed to connect wallet:', error);
        throw error;
      }
    },

    /**
     * CreatePINCommand - Create and broadcast a PIN to the blockchain
     * 
     * This method:
     * 1. Constructs the PIN transaction
     * 2. Signs the transaction using Metalet
     * 3. Broadcasts to the blockchain
     * 
     * @param {Object} params - Command parameters
     * @param {Object} params.payload - PIN data (operation, body, path, contentType)
     * @param {Object} params.stores - Alpine stores
     * @returns {Promise<Object>} Created PIN information
     */
    async createPin({ payload, stores }) {
      try {
        // 1. Construct PIN transaction
        // 2. Sign with Metalet
        // 3. Broadcast to blockchain
        
        const { operation, body, path, contentType } = payload;

        if (!body) {
          throw new Error('PIN body is required');
        }

       

        const parmas = {
          chain: 'mvc',
          feeRate: 1,
          dataList: [
            {
              metaidData: {
                operation: operation,
                path: path,
                body: body,
                contentType: contentType,
              }
            }
          ]
        };
        
        const createPinRes = await window.metaidwallet.createPin(parmas);
        return createPinRes;
      } catch (e) {
        throw new Error(e);
      }
    },

  
  };

  /**
   * ============================================
   * INITIALIZATION
   * ============================================
   */

  /**
   * Initialize IDFramework
   * 
   * This method initializes the framework with built-in models and registers built-in commands.
   * Should be called after Alpine.js is loaded but before DOM processing.
   * 
   * @param {Object} customModels - Optional custom models to register
   * 
   * @example
   * IDFramework.init({
   *   user: { name: '', email: '' }
   * });
   */
  static init(customModels = {}) {
    // Initialize built-in models
    this.initModels(customModels);

    // Register built-in commands
    this.IDController.registerBuiltIn('connectWallet', this.BuiltInCommands.connectWallet);
    this.IDController.registerBuiltIn('createPIN', this.BuiltInCommands.createPin);
  }

  /**
   * ============================================
   * ROUTER LAYER - Hash-based Routing
   * ============================================
   * 
   * IDRouter handles hash-based routing for SPA navigation.
   * It listens to hash changes and dispatches ROUTE_CHANGE events
   * that are handled by routing commands (e.g., NavigateCommand).
   */

  

  /**
   * ============================================
   * HELPER METHODS
   * ============================================
   */

  /**
   * Load a Web Component dynamically (lazy loading)
   * 
   * This method allows components to be loaded on-demand rather than at startup,
   * reducing initial bundle size and improving performance.
   * 
   * @param {string} componentPath - Relative path to the component module (e.g., './idcomponents/id-buzz-card.js')
   * @returns {Promise<void>} Resolves when the component is loaded and registered
   * 
   * @example
   * // Load a component dynamically
   * await IDFramework.loadComponent('./idcomponents/id-buzz-card.js');
   * 
   * // Now the component can be used in the DOM
   * // <id-buzz-card content="Hello" author="user123"></id-buzz-card>
   */
  static async loadComponent(componentPath) {
    try {
      // Use dynamic import to load the component module
      await import(componentPath);
      // Component is automatically registered via customElements.define() in the module
      console.log(`Component loaded: ${componentPath}`);
    } catch (error) {
      console.error(`Failed to load component from ${componentPath}:`, error);
      throw new Error(`Component loading failed: ${error.message}`);
    }
  }

  /**
   * Dispatch an event (helper for views)
   * 
   * This is a convenience method for views to dispatch events.
   * It automatically resolves the appropriate stores and executes the command.
   * 
   * @param {string} eventName - Event name
   * @param {Object} payload - Event payload
   * @param {string} storeName - Optional specific store name (default: auto-resolve all)
   * 
   * @example
   * // In a component
   * await IDFramework.dispatch('fetchBuzz', { cursor: 0, size: 30 });
   * 
   * @example
   * // In a component with specific store
   * await IDFramework.dispatch('updateUser', { name: 'John' }, 'user');
   */
  static async dispatch(eventName, payload = {}, storeName = null) {
    // Auto-resolve all available stores
    // This ensures commands have access to all stores they might need
    const stores = {
      wallet: Alpine.store('wallet'),
      app: Alpine.store('app'),
    };

    // Add all other registered stores (like 'buzz', 'user', etc.)
    // Alpine doesn't provide a direct way to list all stores,
    // so we try common store names and add any that exist
    const commonStoreNames = [ 'user', 'settings'];
    commonStoreNames.forEach(name => {
      const store = Alpine.store(name);
      if (store) {
        stores[name] = store;
      }
    });
    
    // Ensure user store is always included for user-related commands
    if (!stores.user && Alpine.store('user')) {
      stores.user = Alpine.store('user');
    }

    // If specific store requested, add it (even if not in common list)
    if (storeName && Alpine.store(storeName)) {
      stores[storeName] = Alpine.store(storeName);
    }
    
    await this.IDController.execute(eventName, payload, stores);
  }
}

// Make IDFramework globally available
window.IDFramework = IDFramework;

// Expose router for convenience
IDFramework.router = IDFramework.IDRouter;

// Auto-initialize framework when Alpine is ready
// This ensures built-in commands are registered even if init() wasn't called explicitly
if (typeof Alpine !== 'undefined') {
  // Alpine is already loaded, initialize now
  IDFramework.init();
} else {
  // Wait for Alpine to load
  window.addEventListener('alpine:init', () => {
    IDFramework.init();
  });
}
