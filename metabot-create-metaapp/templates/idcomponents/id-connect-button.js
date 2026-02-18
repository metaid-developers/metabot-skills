/**
 * id-connect-button - Web Component for connecting Metalet wallet
 * Uses Shadow DOM with CSS Variables for theming
 * Structure (Layout) managed via CSS, Skin (Theme) managed via CSS Variables
 */

class IdConnectButton extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._address = null;
    this._isConnecting = false;
    this._userStoreWatcher = null;
    this._dropdownOpen = false;
    this._profileModalOpen = false;
    this._selectedAvatarFile = null;
    this._previewAvatarUrl = null;
    this._editedName = '';
    
    // Close dropdown when clicking outside
    this._handleClickOutside = (e) => {
      if (!this._dropdownOpen) return;
      
      const path = e.composedPath();
      // Get user-info container and dropdown menu elements
      const userInfoEl = this.shadowRoot?.querySelector('.user-info');
      const dropdownMenuEl = this.shadowRoot?.querySelector('.dropdown-menu');
      
      // Check if click target is inside user-info container or dropdown menu
      // composedPath() includes all nodes from target to document root
      const isInsideUserInfo = userInfoEl && path.includes(userInfoEl);
      const isInsideDropdown = dropdownMenuEl && path.includes(dropdownMenuEl);
      const isInsideComponent = path.includes(this);
      
      // If click is outside user-info and dropdown menu, close the dropdown
      if (!isInsideUserInfo && !isInsideDropdown && !isInsideComponent) {
        this._dropdownOpen = false;
        this.render();
      }
    };
  }

  static get observedAttributes() {
    return ['address', 'connected'];
  }

  async connectedCallback() {
    // Wait for window.metaidwallet to be available before proceeding
    const metaidwalletAvailable = await this.waitForMetaidwallet();
    
    if (metaidwalletAvailable) {
      // Check if already connected on mount
      await this.checkConnection();
        requestAnimationFrame(() => {
      this.render();
      
      
    });
    } else {
      // If metaidwallet is not available, still render the button
      // but it will show as disconnected
      requestAnimationFrame(() => {
      this.render();
      
      
    });
    }
    
    // Setup Alpine store watcher for user info updates
    this._watchUserStore();
    
    // Add click outside listener
    document.addEventListener('click', this._handleClickOutside);
  }

  /**
   * Poll for window.metaidwallet availability
   * @returns {Promise<boolean>} Returns true if metaidwallet is available, false if timeout
   */
  async waitForMetaidwallet() {
    // If already available, return immediately
    if (window.metaidwallet !== undefined) {
      return true;
    }

    const maxAttempts = 50; // Maximum number of polling attempts
    const pollInterval = 100; // Poll every 100ms
    let attempts = 0;

    return new Promise((resolve) => {
      const poll = setInterval(() => {
        attempts++;

        if (window.metaidwallet !== undefined) {
          clearInterval(poll);
          resolve(true);
          return;
        }

        if (attempts >= maxAttempts) {
          clearInterval(poll);
          console.error('window.metaidwallet does not exist after', maxAttempts * pollInterval, 'ms');
          resolve(false);
        }
      }, pollInterval);
    });
  }
 
  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue) {
      if (!this._renderScheduled) {
        this._renderScheduled = true;
        requestAnimationFrame(() => {
          this._renderScheduled = false;
          this.render();
        });
      }
    }
  }

  async checkConnection() {
    
    // Check if Metalet is available and already connected
    if (window.metaidwallet) {
      try {
         // Get wallet info from store
        const walletStore = Alpine.store('wallet');
        //const isConnected = await window.metaidwallet.isConnected();
        // if (!walletStore.isConnected && !walletStore.address) {
        //   // Use framework's connectWallet to sync state
        //   if (window.IDFramework) {
        //     await window.IDFramework.dispatch('connectWallet');
        //   }
        // }
        
        if (walletStore && walletStore.isConnected && walletStore.address) {
          this._address = walletStore.address;
          this.setAttribute('connected', 'true');
          this.setAttribute('address', walletStore.address);
          
          // Re-render to show connected state (will read user info from store)
          requestAnimationFrame(() => {
          this.render();


          });
          
          // Auto-fetch user info if metaid is available
          const metaid = walletStore.globalMetaId || walletStore.metaid;
          if (metaid && window.IDFramework) {
            window.IDFramework.dispatch('fetchUser', { metaid }).catch(err => {
              console.warn(`Failed to fetch user info for ${metaid}:`, err);
            });
          }
        }
      } catch (error) {
        console.warn('Failed to check Metalet connection:', error);
      }
    }
  }
  
  /**
   * Get user info from Alpine store (data-driven approach)
   * This method reads directly from store, ensuring we always get the latest data
   */
  _getUserInfoFromStore() {
    
    if (typeof Alpine === 'undefined') return null;
    
    const walletStore = Alpine.store('wallet');
    const userStore = Alpine.store('user');
    
    if (!walletStore || !userStore) return null;
    
    // Priority 1: Get metaid from userStore.user.metaid (if already fetched)
    // Priority 2: Fallback to walletStore.globalMetaId (to trigger fetch)
    const userData = userStore.user || {};
    const metaidFromUser = userData.metaid;
    const metaidFromWallet = walletStore.globalMetaId || walletStore.metaid;
    const metaid = metaidFromUser;
    const address = walletStore.address || this._address || '';
    
    // If no metaid available, return null
    if (!metaid) return null;
    
    // Return user info from store (will be empty if not fetched yet, but metaid is available)
    return {
      name: userData?.name || '',
      nameId:userData?.nameId ||'',
      metaid: metaid, // Use the resolved metaid (from user or wallet)
      globalMetaId:metaidFromWallet,
      avatarUrl: userData?.avatarUrl || this.generateAvatarSVG(address),
      address: address
    };
  }
  
  /**
   * Watch Alpine user store for changes (data-driven reactive updates)
   * When store changes, trigger re-render which will read latest data from store
   */
  _watchUserStore() {
    if (typeof Alpine === 'undefined') {
      // Wait for Alpine to be available
      setTimeout(() => this._watchUserStore(), 100);
      return;
    }
    
    // Use a polling approach since Alpine doesn't work directly in Shadow DOM
    // Check every 300ms for store updates (more responsive than 500ms)
    if (this._userStoreWatcher) {
      clearInterval(this._userStoreWatcher);
    }
    
    let lastUserInfoHash = null;
    
    this._userStoreWatcher = setInterval(() => {
      const walletStore = Alpine.store('wallet');
      if (!walletStore || !walletStore.isConnected || !this.hasAttribute('connected')) {
        return;
      }
      
      // Get current user info from store
      const currentUserInfo = this._getUserInfoFromStore();
      
      if (!currentUserInfo) {
        // If no metaid available, can't fetch user info
        return;
      }
      
      // If user data exists but doesn't have name/avatarUrl, trigger fetch
      const userStore = Alpine.store('user');
      const userData = userStore?.user || {};
      const metaid = currentUserInfo.globalMetaId;
      
      // Check if we need to fetch user info
      // Fetch if: metaid exists but userData doesn't have name (meaning not fetched yet)
      if (metaid && (!userData.name || !userData.metaid) && window.IDFramework) {
        // Only fetch if not already loading to avoid duplicate requests
        if (!userStore.isLoading) {
          window.IDFramework.dispatch('fetchUser', { metaid }).catch(err => {
            console.warn(`Failed to fetch user info for ${metaid}:`, err);
          });
        }
      }
      
      // Create a hash to detect changes
      const currentHash = JSON.stringify({
        name: currentUserInfo.name,
        metaid: currentUserInfo.metaid,
        avatarUrl: currentUserInfo.avatarUrl
      });
      
      // Only re-render if user info actually changed
      if (currentHash !== lastUserInfoHash) {
        lastUserInfoHash = currentHash;
         requestAnimationFrame(() => {
      this.render();
      
      
    });
      }
    }, 300);
  }
  
  disconnectedCallback() {
    // Clean up watcher when component is removed
    if (this._userStoreWatcher) {
      clearInterval(this._userStoreWatcher);
      this._userStoreWatcher = null;
    }
    // Remove click outside listener
    document.removeEventListener('click', this._handleClickOutside);
  }

  async handleConnect() {
    
    if (this._isConnecting) return;
    
    this._isConnecting = true;
      requestAnimationFrame(() => {
      this.render();
      
      
    });

    try {
      // Use framework's built-in connectWallet command
      if (window.IDFramework) {
        await window.IDFramework.dispatch('connectWallet');
        
        // Get updated wallet info from store
        const walletStore = Alpine.store('wallet');
      
        if (walletStore && walletStore.isConnected && walletStore.address) {
          this._address = walletStore.address;
          this.setAttribute('connected', 'true');
          this.setAttribute('address', walletStore.address);
          
      
          
          // Dispatch custom event for external listeners
          this.dispatchEvent(new CustomEvent('connected', {
            detail: { 
              address: walletStore.address,
              globalMetaId: walletStore.globalMetaId 
            },
            bubbles: true
          }));
          
          // Auto-fetch user info if metaid is available
          const metaid = walletStore.metaid || walletStore.globalMetaId;
          if (metaid && window.IDFramework) {
            
          await window.IDFramework.dispatch('fetchUser', { metaid }).catch(err => {
              console.warn(`Failed to fetch user info for ${metaid}:`, err);
            });
          }
              // Re-render to show connected state (will read user info from store)
              
           requestAnimationFrame(() => {
      this.render();
      
      
    });
        }
      } else {
        throw new Error('IDFramework is not available');
      }
    } catch (error) {
      console.error('Failed to connect to Metalet:', error);
      alert(error.message || 'Failed to connect to Metalet wallet. Please try again.');
    } finally {
      this._isConnecting = false;
       requestAnimationFrame(() => {
      this.render();
      
      
    });
    }
  }

  handleDisconnect() {
    this._dropdownOpen = false;
    if (window.metaidwallet) {
      window.metaidwallet.disconnect().then(() => {
        this._address = null;
        this.removeAttribute('connected');
        this.removeAttribute('address');
        
        // Clean up watcher
        if (this._userStoreWatcher) {
          clearInterval(this._userStoreWatcher);
          this._userStoreWatcher = null;
        }
        
        // Update stores with disconnect status
        if (typeof Alpine !== 'undefined') {
          const walletStore = Alpine.store('wallet');
          const appStore = Alpine.store('app');
          const userStore = Alpine.store('user');
          
          if (walletStore) {
            walletStore.isConnected = false;
            walletStore.address = null;
            walletStore.metaid = null;
          }
          
          if (appStore) {
            appStore.isLogin = false;
            appStore.userAddress = null;
          }
          
          if (userStore) {
            userStore.user = {};
          }
        }
        
        // Clear localStorage data
        try {
          localStorage.removeItem('idframework_app_isLogin');
          localStorage.removeItem('idframework_app_userAddress');
          localStorage.removeItem('idframework_user_users');
          localStorage.removeItem('idframework_wallet');
        } catch (error) {
          console.error('Failed to clear localStorage:', error);
        }
        
        // Dispatch custom event for external listeners
        this.dispatchEvent(new CustomEvent('disconnected', {
          bubbles: true
        }));
        
     requestAnimationFrame(() => {
      this.render();
      
      
    });
      }).catch(error => {
        console.error('Failed to disconnect from Metalet:', error);
      });
    }
  }

  handleUserInfoClick(e) {
    e.stopPropagation();
    this._dropdownOpen = !this._dropdownOpen;
     requestAnimationFrame(() => {
      this.render();
      
      
    });
  }

  handleEditProfile() {
    this._dropdownOpen = false;
    const userInfo = this._getUserInfoFromStore();
    if (userInfo) {
      this._editedName = userInfo.name || '';
      this._previewAvatarUrl = userInfo.avatarUrl || null;
      this._selectedAvatarFile = null;
      this._profileModalOpen = true;
        requestAnimationFrame(() => {
      this.render();
      
      
    });
    }
  }

  handleCloseProfileModal() {
    this._profileModalOpen = false;
    this._selectedAvatarFile = null;
    this._previewAvatarUrl = null;
    this._editedName = '';
     requestAnimationFrame(() => {
      this.render();
      
      
    });
  }

  handleAvatarClick() {
    const fileInput = this.shadowRoot.querySelector('#avatar-file-input');
    if (fileInput) {
      fileInput.click();
    }
  }

  handleAvatarFileChange(e) {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      this._selectedAvatarFile = file;
      // Create preview URL
      const reader = new FileReader();
      reader.onload = (event) => {
        this._previewAvatarUrl = event.target.result;
        this.render();
      };
      reader.readAsDataURL(file);
    }
  }

  handleSaveProfile() {
    // TODO: Implement save profile logic
    // For now, just close the modal
    console.log('Saving profile:', {
      name: this._editedName,
      avatarFile: this._selectedAvatarFile
    });
    this.handleCloseProfileModal();
  }

  render() {
    const isConnected = this.hasAttribute('connected') && this.getAttribute('connected') === 'true';
    const address = this.getAttribute('address') || this._address || '';
    const displayAddress = address ? this.formatAddress(address) : '';
    
    // Data-driven: Read user info directly from Alpine store
    // This ensures we always get the latest data, even if updated asynchronously
    const userInfo = isConnected ? this._getUserInfoFromStore() : null;
    const userName = userInfo?.name || '';
    
    const userMetaId = userInfo?.metaid || '';
    const userAvatarUrl = userInfo?.avatarUrl;
    const displayName = this.formatName(userName);
    const displayMetaId = userMetaId ? (userMetaId.substring(0, 12) + '...') : '';

    this.shadowRoot.innerHTML = `
      <style>
        /* Host element styling */
        :host {
          display: inline-block;
          font-family: var(--id-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif);
          position: fixed;
          top: 1rem;
          right: 1rem;
          z-index: 1000;
        }

        /* Connect Button - Default State */
        .connect-button {
          /* Structure: Layout */
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--id-spacing-sm, 0.5rem);
          padding: var(--id-spacing-sm, 0.5rem) var(--id-spacing-md, 1rem);
          border: none;
          border-radius: var(--id-radius-button, 0.5rem);
          cursor: pointer;
          transition: background-color var(--id-transition-base, 0.2s), transform var(--id-transition-fast, 0.1s);
          
          /* Skin: Theme */
          background-color: var(--id-bg-button, var(--id-color-primary, #3b82f6));
          color: var(--id-text-inverse, #ffffff);
          font-size: var(--id-font-size-base, 1rem);
          font-weight: var(--id-font-weight-semibold, 600);
        }

        .connect-button:hover:not(:disabled) {
          background-color: var(--id-bg-button-hover, var(--id-color-primary-hover, #2563eb));
          transform: translateY(-1px);
        }

        .connect-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .connect-button:disabled {
          background-color: var(--id-bg-button-disabled, #9ca3af);
          cursor: not-allowed;
          opacity: 0.7;
        }

        /* User Info Container - Connected State */
        .user-info {
          /* Structure: Layout */
          display: inline-flex;
          align-items: center;
          gap: var(--id-spacing-sm, 0.5rem);
          padding: 5px 10px;
          border-radius: var(--id-radius-button, 0.5rem);
          cursor: pointer;
          transition: background-color var(--id-transition-base, 0.2s);
          
          /* Skin: Theme */
          background-color:var(--id-bg-body,#fff);
        }

        .user-info:hover {
          background-color: var(--id-bg-card, rgba(0, 0, 0, 0.05));
        }

        /* Avatar */
        .avatar {
          /* Structure: Layout */
          width: 2rem;
          height: 2rem;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
          padding:3px;
          
          /* Skin: Theme */
          border: 2px solid var(--id-border-color, #e5e7eb);
          background-color: var(--id-bg-card, #ffffff);
        }

        /* User Info Text Container */
        .user-info-text {
          /* Structure: Layout */
          display: flex;
          flex-direction: column;
          gap: 0.125rem;
        }

        /* Name Display */
        .name {
          /* Structure: Layout */
          display: inline-flex;
          align-items: center;
          font-size: var(--id-font-size-sm, 0.875rem);
          font-weight: var(--id-font-weight-semibold, 600);
          
          /* Skin: Theme */
          color: var(--id-text-main, #1f2937);
        }

        /* MetaID Display */
        .metaid {
          /* Structure: Layout */
          display: inline-flex;
          align-items: center;
          font-size: var(--id-font-size-xs, 0.75rem);
          font-weight: var(--id-font-weight-normal, 400);
          
          /* Skin: Theme */
          color: var(--id-text-secondary, #6b7280);
        }

        /* User Info Container - Position relative for dropdown */
        .user-info {
          position: relative;
        }

        /* Dropdown Menu */
        .dropdown-menu {
          position: absolute;
          top: calc(100% + 0.5rem);
          right: 0;
          background-color: var(--id-bg-card, #ffffff);
          border: 1px solid var(--id-border-color, #e5e7eb);
          border-radius: var(--id-radius-card, 0.5rem);
          box-shadow: var(--id-shadow-md, 0 4px 6px -1px rgba(0, 0, 0, 0.1));
          min-width: 160px;
          z-index: 1000;
          display: ${this._dropdownOpen ? 'block' : 'none'};
          overflow: hidden;
        }

        .dropdown-item {
          display: flex;
          align-items: center;
          gap: var(--id-spacing-sm, 0.5rem);
          padding: var(--id-spacing-sm, 0.5rem) var(--id-spacing-md, 1rem);
          cursor: pointer;
          transition: background-color var(--id-transition-base, 0.2s);
          font-size: var(--id-font-size-sm, 0.875rem);
          color: var(--id-text-main, #1f2937);
          border: none;
          background: none;
          width: 100%;
          text-align: left;
        }

        .dropdown-item:hover {
          background-color: var(--id-bg-body, rgba(0, 0, 0, 0.05));
        }

        .dropdown-item:disabled,
        .dropdown-item.disabled {
          opacity: 0.5;
          cursor: not-allowed;
          pointer-events: none;
        }

        .dropdown-item:disabled:hover,
        .dropdown-item.disabled:hover {
          background-color: transparent;
        }

        .dropdown-item-icon {
          width: 1rem;
          height: 1rem;
          flex-shrink: 0;
        }

        /* Profile Modal */
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: ${this._profileModalOpen ? 'flex' : 'none'};
          align-items: center;
          justify-content: center;
          z-index: 10000;
        }

        .modal-content {
          background-color: var(--id-bg-card, #ffffff);
          border-radius: 50px;
          padding: var(--id-spacing-xl, 2rem);
          max-width: 500px;
          width: 90%;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: var(--id-shadow-lg, 0 10px 15px -3px rgba(0, 0, 0, 0.1));
          /* Hide scrollbar */
          scrollbar-width: none; /* Firefox */
          -ms-overflow-style: none; /* IE and Edge */
        }

        .modal-content::-webkit-scrollbar {
          display: none; /* Chrome, Safari, Opera */
        }

        .modal-title {
          font-size: 2rem;
          font-weight: var(--id-font-weight-bold, 700);
          color: var(--id-text-title, #111827);
          margin-bottom: var(--id-spacing-md, 1rem);
          text-align: center;
        }

        .modal-subtitle {
          font-size: var(--id-font-size-sm, 0.875rem);
          color: var(--id-text-secondary, #6b7280);
          margin-bottom: var(--id-spacing-xl, 2rem);
          text-align: center;
        }

        .avatar-upload-container {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: var(--id-spacing-xl, 2rem);
        }

        .avatar-upload-wrapper {
          position: relative;
          width: 105px;
          height: 105px;
          margin-bottom: var(--id-spacing-sm, 0.5rem);
        }

        .avatar-upload {
          width: 80px;
          height: 80px;
          border-radius: 30%;
          object-fit: cover;
          padding:5px;
          border: 2px solid var(--id-border-color, #e5e7eb);
          cursor: pointer;
          transition: opacity var(--id-transition-base, 0.2s);
        }

        .avatar-upload:hover {
          opacity: 0.8;
        }

        .avatar-upload-icon {
          position: absolute;
          bottom: 0;
          right: 0;
          width: 28px;
          height: 28px;
          background-color: var(--id-bg-button, var(--id-color-primary, #3b82f6));
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          border: 2px solid var(--id-bg-card, #ffffff);
        }

        .avatar-upload-icon svg {
          width: 18px;
          height: 18px;
          fill: var(--id-text-inverse, #ffffff);
        }

        .avatar-optional {
          font-size: var(--id-font-size-xs, 0.75rem);
          color: var(--id-text-secondary, #6b7280);
        }

        .form-group {
          margin-bottom: var(--id-spacing-lg, 1.5rem);
        }

        .form-label {
          display: block;
          font-size: var(--id-font-size-sm, 0.875rem);
          font-weight: var(--id-font-weight-semibold, 600);
          color: var(--id-text-main, #1f2937);
          margin-bottom: var(--id-spacing-xs, 0.25rem);
        }

        .form-input {
          width: 100%;
          padding: var(--id-spacing-sm, 0.5rem) var(--id-spacing-md, 1rem);
          border: 1px solid var(--id-border-color, #e5e7eb);
          border-radius: var(--id-radius-small, 0.25rem);
          font-size: var(--id-font-size-base, 1rem);
          color: var(--id-text-main, #1f2937);
          background-color: var(--id-bg-card, #ffffff);
          transition: border-color var(--id-transition-base, 0.2s);
        }

        .form-input:focus {
          outline: none;
          border-color: var(--id-color-primary, #3b82f6);
        }

        /* User name wrap specific styles */
        .user-name-wrap .form-input {
          width: 90%;
          border-radius: 12px;
        }

        .file-input {
          display: none;
        }

        .modal-actions {
          display: flex;
          justify-content: flex-end;
          gap: var(--id-spacing-sm, 0.5rem);
        }

        .modal-button {
          padding: var(--id-spacing-sm, 0.5rem) var(--id-spacing-lg, 1.5rem);
          border: none;
          border-radius: var(--id-radius-button, 0.5rem);
          font-size: var(--id-font-size-base, 1rem);
          font-weight: var(--id-font-weight-semibold, 600);
          cursor: pointer;
          transition: background-color var(--id-transition-base, 0.2s), transform var(--id-transition-fast, 0.1s);
        }

        .modal-button-primary {
          background-color: var(--id-bg-button, var(--id-color-primary, #3b82f6));
          color: var(--id-text-inverse, #ffffff);
        }

        .modal-button-primary:hover {
          background-color: var(--id-bg-button-hover, var(--id-color-primary-hover, #2563eb));
          transform: translateY(-1px);
        }
      </style>
      ${isConnected ? `
        <div part="user-info" class="user-info" title="Click to open menu">
          <img part="avatar" class="avatar" src="${userAvatarUrl}" alt="User Avatar" />
          <div part="user-info-text" class="user-info-text">
            <span part="name" class="name">${this.escapeHtml(displayName)}</span>
            <span part="metaid" class="metaid">MetaID:${this.escapeHtml(displayMetaId?.slice(0,6))}</span>
          </div>
          ${this._dropdownOpen ? `
            <div class="dropdown-menu">
              <button class="dropdown-item disabled" data-action="edit-profile" disabled>
                <svg class="dropdown-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
                Edit Profile
              </button>
              <button class="dropdown-item" data-action="logout">
                <svg class="dropdown-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                  <polyline points="16 17 21 12 16 7"></polyline>
                  <line x1="21" y1="12" x2="9" y2="12"></line>
                </svg>
                Log Out
              </button>
            </div>
          ` : ''}
        </div>
      ` : `
        <button 
          part="connect-button" 
          class="connect-button"
          ${this._isConnecting ? 'disabled' : ''}
        >
          ${this._isConnecting ? 'Connecting...' : 'Connect'}
        </button>
      `}
      ${this._profileModalOpen ? `
        <div class="modal-overlay edit-profile-modal">
          <div class="modal-content">
            <h2 class="modal-title">Set up your profile</h2>
            <p class="modal-subtitle">Make your account stand out - add a unique avatar and display name!</p>
            <div class="avatar-upload-container">
              <div class="avatar-upload-wrapper">
                <img class="avatar-upload" src="${this._previewAvatarUrl || userAvatarUrl}" alt="Avatar" />
                <div class="avatar-upload-icon" data-action="upload-avatar">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                    <circle cx="12" cy="13" r="4"></circle>
                  </svg>
                </div>
              </div>
              <span class="avatar-optional">Optional</span>
              <input type="file" id="avatar-file-input" class="file-input" accept="image/*" />
            </div>
            <div class="form-group user-name-wrap ">
              <label class="form-label">UserName</label>
              <input type="text" class="form-input" id="username-input" value="${this.escapeHtml(this._editedName)}" placeholder="请输入用户名" />
            </div>
            <div class="modal-actions">
              <button class="modal-button modal-button-primary" data-action="save-profile">
                Save
              </button>
            </div>
          </div>
        </div>
      ` : ''}
    `;

    // Attach event listeners after rendering
    if (isConnected) {
      const userInfoEl = this.shadowRoot.querySelector('.user-info');
      if (userInfoEl) {
        userInfoEl.addEventListener('click', (e) => this.handleUserInfoClick(e));
      }

      // Dropdown menu items
      const editProfileBtn = this.shadowRoot.querySelector('[data-action="edit-profile"]');
      if (editProfileBtn && !editProfileBtn.disabled) {
        editProfileBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleEditProfile();
        });
      }

      const logoutBtn = this.shadowRoot.querySelector('[data-action="logout"]');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.handleDisconnect();
        });
      }
    } else {
      const connectButton = this.shadowRoot.querySelector('.connect-button');
      if (connectButton) {
        connectButton.addEventListener('click', () => this.handleConnect());
      }
    }

    // Profile modal handlers
    if (this._profileModalOpen) {
      const modalOverlay = this.shadowRoot.querySelector('.modal-overlay');
      if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
          if (e.target === modalOverlay) {
            this.handleCloseProfileModal();
          }
        });
      }

      const avatarUploadIcon = this.shadowRoot.querySelector('[data-action="upload-avatar"]');
      if (avatarUploadIcon) {
        avatarUploadIcon.addEventListener('click', () => this.handleAvatarClick());
      }

      const fileInput = this.shadowRoot.querySelector('#avatar-file-input');
      if (fileInput) {
        fileInput.addEventListener('change', (e) => this.handleAvatarFileChange(e));
      }

      const usernameInput = this.shadowRoot.querySelector('#username-input');
      if (usernameInput) {
        usernameInput.addEventListener('input', (e) => {
          this._editedName = e.target.value;
        });
      }

      const saveBtn = this.shadowRoot.querySelector('[data-action="save-profile"]');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.handleSaveProfile());
      }
    }
  }

  formatAddress(address) {
    if (!address) return '';
    if (address.length <= 12) return address;
    return `${address.substring(0, 6)}...${address.substring(address.length - 4)}`;
  }

  formatName(name) {
    if (!name) return '';
    if (name.length <= 20) return name;
    return name.substring(0, 20);
  }

  getInitials(address) {
    if (!address) return '?';
    // Use first character of address as initial
    const initial = address.charAt(0).toUpperCase();
    // Only allow alphanumeric characters for safety
    return /[A-Z0-9]/.test(initial) ? initial : '?';
  }

  generateAvatarSVG(address) {
    const initial = this.getInitials(address);
    // Encode SVG properly for data URI
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="16" cy="16" r="16" fill="#3b82f6"/><text x="16" y="22" font-size="18" font-weight="bold" text-anchor="middle" fill="white">${this.escapeHtml(initial)}</text></svg>`;
    return `data:image/svg+xml,${encodeURIComponent(svg)}`;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Register the custom element
customElements.define('id-connect-button', IdConnectButton);

