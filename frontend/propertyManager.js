class PropertyManager {
    constructor() {
        // Store data in regular variables (will be synced with backend)
        this.seenHomes = [];
        this.favoriteHomes = [];
        this.allResults = [];
        this.currentTab = 'unseen';
        this.currentSelectedPropertyListingId = null

        this.API_BASE = 'http://127.0.0.1:8000/api';

        const viewport = localStorage.getItem('map_viewport') != null ? JSON.parse(localStorage.getItem('map_viewport')) : null

        // Default viewport (San Francisco area)
        this.viewport = viewport ?? {
            "min": {
                "longitude": -122.45676123666753,
                "latitude": 37.785855280585544
            },
            "max": {
                "longitude": -122.38160476472149,
                "latitude": 37.79207094589198
            }
        };

        // Callback for when properties are updated - set by parent application
        this.onPropertiesUpdate = null;

        this.setupGraphQLPayload();
    }

    setupGraphQLPayload() {
        this.payload = {
            "operationName": "Search",
            "variables": {
                "searchId": "423",
                "location": {
                    "viewport": this.viewport
                },
                "searchSessionId": "2234432",
                "pageInfo": {
                    "pageNumber": 1,
                    "pageSize": 100
                },
                "filters": [
                    { "key": "dishwasher", "value": "true" },
                    { "key": "max-price", "value": "4000" },
                    { "key": "min-price", "value": "3000" }
                ]
            },
            "query": "query Search($location: SearchRequestLocation!, $searchId: String!, $searchSessionId: String!, $pageInfo: SearchRequestPageInfo!, $filters: [SearchFilter!]) {\n  search(\n    location: $location\n    searchId: $searchId\n    searchSessionId: $searchSessionId\n    pageInfo: $pageInfo\n    filters: $filters\n  ) {\n    pageInfo {\n      pageSize\n      totalResults\n      hasPreviousPage\n      hasNextPage\n      endPageNumber\n      currentPageSize\n      currentPageNumber\n      __typename\n    }\n    results {\n      propertyType\n      propertyTypeClass\n      approxLocation {\n        latitude\n        longitude\n        __typename\n      }\n      name\n      propertyTypeClass\n      amenities\n      listingId\n      laundryType\n      description\n      encodedLocationName\n      availableOnDate\n      isAvailableNow\n      photos {\n        url\n        isFeatured\n        __typename\n      }\n      rentAmount {\n        amount\n        currency\n        __typename\n      }\n      totalSleeps\n      bedroomCount\n      bathroomCount\n      amenities\n      __typename\n    }\n    context {\n      sortVariantId\n      __typename\n    }\n    __typename\n  }\n}"
        };
    }

    async init() {
        try {
            // First load stored data from backend
            await this.loadStoredData();

            // Then fetch new property data
            await this.fetchData();

            // Setup tab event listeners
            this.setupEventListeners();

            console.log('PropertyManager initialized successfully');
        } catch (error) {
            console.error('Error initializing PropertyManager:', error);
        }
    }

    setupEventListeners() {
        document.getElementById('unseen').addEventListener('click', () => this.switchTab('unseen'));
        document.getElementById('favorites').addEventListener('click', () => this.switchTab('favorites'));
    }

    // API Helper Functions
    async apiCall(endpoint, method = 'GET', data = null) {
        try {
            const options = {
                method,
                headers: {
                    'Content-Type': 'application/json',
                }
            };

            if (data) {
                options.body = JSON.stringify(data);
            }

            const response = await fetch(`${this.API_BASE}${endpoint}`, options);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }

    // Load seen homes and favorites from backend
    async loadStoredData() {
        try {
            // Load seen homes
            const seenResponse = await this.apiCall('/homes/seen');
            this.seenHomes = seenResponse.seen_homes.map(home => home.property_url);

            // Load favorites
            const favoritesResponse = await this.apiCall('/homes/favorites');
            this.favoriteHomes = favoritesResponse.favorites.map(fav => ({
                url: fav.property_url,
                data: fav.property_data
            }));

            console.log('Loaded from backend:', {
                seenCount: this.seenHomes.length,
                favoritesCount: this.favoriteHomes.length
            });

        } catch (error) {
            console.error('Error loading stored data:', error);
            // Continue with empty arrays if backend fails
        }
    }

    scrollToProperty(property) {
        console.error("SCROLLING", property)
        const oldEl = document.getElementById(`card_${this.currentSelectedPropertyListingId}`);
        oldEl?.classList.remove('active')
        const el = document.getElementById(`card_${property.listingId}`);
        this.currentSelectedPropertyListingId = property.listingId;
        el.classList.add('active')
        el?.scrollIntoView({ behavior: 'smooth' });
    }

    // Method called by MapManager when bounds change
    updateSearchBounds(coords) {
        console.log('PropertyManager received bounds update:', coords);

        if (!coords || !coords.southWest || !coords.northEast) {
            return;
        }

        this.viewport = {
            "min": {
                "longitude": coords.southWest.lng,
                "latitude": coords.southWest.lat
            },
            "max": {
                "longitude": coords.northEast.lng,
                "latitude": coords.northEast.lat
            }
        };
        localStorage.setItem('map_viewport', JSON.stringify(this.viewport))

        // Update the GraphQL payload
        this.payload.variables.location.viewport = this.viewport;

        // Fetch new data with updated bounds
        this.fetchData();
    }

    getListingUrl(listingId, name) {
        return listingId ? `https://www.furnishedfinder.com/property/${listingId}` : `#${name}`;
    }

    switchTab(tabName) {
        // Update active tab
        document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

        if (tabName === 'unseen') {
            document.querySelector('.tab:first-child').classList.add('active');
            document.getElementById('unseen-content').classList.add('active');
            this.displayUnseenResults();
        } else if (tabName === 'favorites') {
            document.querySelector('.tab:last-child').classList.add('active');
            document.getElementById('favorites-content').classList.add('active');
            this.displayFavorites();
        }

        this.currentTab = tabName;
    }

    async addToFavorites(result) {
        const resultUrl = this.getListingUrl(result.listingId, result.name);

        // Check if already in favorites locally
        if (this.favoriteHomes.find(fav => fav.url === resultUrl)) {
            console.log('Already in favorites');
            return;
        }

        try {
            // Add to backend
            await this.apiCall('/homes/favorites', 'POST', {
                property_url: resultUrl,
                property_name: result.name,
                listing_id: result.listingId,
                property_data: result
            });

            // Update local state
            this.favoriteHomes.push({
                url: resultUrl,
                data: result
            });

            console.log('Added to favorites:', result.name);

            // Show success feedback
            this.showNotification('Added to favorites!', 'success');

            // Refresh current view
            if (this.currentTab === 'unseen') {
                this.displayUnseenResults();
            } else {
                this.displayFavorites();
            }

        } catch (error) {
            console.error('Error adding to favorites:', error);
            this.showNotification('Failed to add to favorites', 'error');
        }
    }

    async removeFromFavorites(resultUrl) {
        try {
            // Remove from backend
            await this.apiCall('/homes/favorites', 'DELETE', {
                property_url: resultUrl
            });

            // Update local state
            this.favoriteHomes = this.favoriteHomes.filter(fav => fav.url !== resultUrl);

            console.log('Removed from favorites:', resultUrl);

            // Show success feedback
            this.showNotification('Removed from favorites!', 'success');

            this.displayFavorites();

        } catch (error) {
            console.error('Error removing from favorites:', error);
            this.showNotification('Failed to remove from favorites', 'error');
        }
    }

    async markAsSeen(result) {
        const resultUrl = this.getListingUrl(result.listingId, result.name);

        // Check if already seen locally
        if (this.seenHomes.includes(resultUrl)) {
            console.log('Already marked as seen');
            return;
        }

        try {
            // Add to backend
            await this.apiCall('/homes/seen', 'POST', {
                property_url: resultUrl,
                property_name: result.name,
                listing_id: result.listingId
            });

            // Update local state
            this.seenHomes.push(resultUrl);

            console.log('Marked as seen:', result.name);

            // Show success feedback
            this.showNotification('Marked as seen!', 'success');

            this.displayUnseenResults();

        } catch (error) {
            console.error('Error marking as seen:', error);
            this.showNotification('Failed to mark as seen', 'error');
        }
    }

    // Notification system
    showNotification(message, type = 'info') {
        // Remove existing notifications
        const existing = document.querySelector('.notification');
        if (existing) {
            existing.remove();
        }

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;
        notification.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 20px;
            border-radius: 6px;
            color: white;
            font-weight: 500;
            z-index: 1000;
            opacity: 0;
            transform: translateX(100%);
            transition: all 0.3s ease;
            ${type === 'success' ? 'background-color: #4CAF50;' : ''}
            ${type === 'error' ? 'background-color: #f44336;' : ''}
            ${type === 'info' ? 'background-color: #2196F3;' : ''}
        `;

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateX(0)';
        }, 10);

        // Auto remove after 3 seconds
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateX(100%)';
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    }

    createCard(result, isFavorite = false) {
        const card = document.createElement('div');
        card.className = 'card';
        card.id = `card_${result.listingId}`

        const photo = result.photos && result.photos.length > 0 ? result.photos[0] : null;
        const imageUrl = photo ? photo.url : null;
        const resultUrl = this.getListingUrl(result.listingId, result.name);
        // Check if this property is in favorites
        const isInFavorites = this.favoriteHomes.find(fav => fav.url === resultUrl);

        // Use a template literal to build the HTML structure
        card.innerHTML = `
            <a target="_blank" href="${resultUrl}">
                ${imageUrl ?
                `<img src="${imageUrl}" alt="${result.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                     <div class="no-image" style="display: none;">No Image Available</div>` :
                `<div class="no-image">No Image Available</div>`
            }
                ${isInFavorites ? '<div class="favorite-badge">♥ Favorite</div>' : ''}
            </a>

            <div class="card-content">
                <div class="card-name">${result.name || 'Unnamed Property'}</div>
                <div class="card-url">${resultUrl}</div>

                <div class="card-actions">
                    ${!isFavorite ? `
                        <button class="btn btn-favorite">
                            ♥ Favorite
                        </button>
                        <button class="btn btn-seen">
                            Mark as Seen
                        </button>
                    ` : `
                        <button class="btn btn-remove">
                            Remove from Favorites
                        </button>
                    `}
                </div>
            </div>
        `;

        // Add event listeners after the HTML is added to the card element
        if (!isFavorite) {
            // Event listener for the Favorite button
            const favoriteButton = card.querySelector('.btn-favorite');
            if (favoriteButton) {
                favoriteButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    // Retrieve the data from the data attribute
                    this.addToFavorites(result);
                });
            }

            // Event listener for the Mark as Seen button
            const seenButton = card.querySelector('.btn-seen');
            if (seenButton) {
                seenButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    // Retrieve the data from the data attribute
                    this.markAsSeen(result);
                });
            }
        } else {
            // Event listener for the Remove from Favorites button
            const removeButton = card.querySelector('.btn-remove');
            if (removeButton) {
                removeButton.addEventListener('click', (event) => {
                    event.stopPropagation();
                    // Retrieve the URL from the data attribute
                    this.removeFromFavorites(resultUrl);
                });
            }
        }

        return card;
    }

    displayUnseenResults() {
        const resultsContainer = document.querySelector('#results');
        resultsContainer.innerHTML = '';

        if (!this.allResults || this.allResults.length === 0) {
            resultsContainer.innerHTML = '<div class="loading">Loading...</div>';
            return;
        }

        console.log("Displaying results:", this.allResults.length);

        // Filter out seen homes
        const unseenResults = this.allResults.filter(result => {
            const resultUrl = this.getListingUrl(result.listingId, result.name);
            return !this.seenHomes.includes(resultUrl);
        });

        if (unseenResults.length === 0) {
            resultsContainer.innerHTML = '<div class="error">All results have been seen</div>';
            return;
        }

        unseenResults.forEach(result => {
            const card = this.createCard(result, false);
            resultsContainer.appendChild(card);
        });

        // Notify map manager of new properties
        if (this.onPropertiesUpdate) {
            this.onPropertiesUpdate(unseenResults);
        }
    }

    displayFavorites() {
        const favoritesContainer = document.querySelector('#favorites-results');
        favoritesContainer.innerHTML = '';

        if (this.favoriteHomes.length === 0) {
            favoritesContainer.innerHTML = '<div class="error">No favorites yet. Add some homes to your favorites!</div>';
            return;
        }

        // Create grid layout for favorites
        favoritesContainer.style.display = 'grid';
        favoritesContainer.style.gridTemplateColumns = 'repeat(auto-fill, minmax(300px, 1fr))';
        favoritesContainer.style.gap = '20px';
        favoritesContainer.style.padding = '20px 0';

        this.favoriteHomes.forEach(favorite => {
            const card = this.createCard(favorite.data, true);
            favoritesContainer.appendChild(card);
        });
    }

    // Make the POST request to GraphQL
    async fetchData() {
        try {
            const response = await fetch('http://127.0.0.1:8000/graphql', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.payload)
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const data = await response.json();

            if (data?.data?.search?.results) {
                this.allResults = data.data.search.results;
                this.displayUnseenResults();
            } else {
                throw new Error('No results found in response');
            }

        } catch (error) {
            console.error('Error fetching data:', error);
            const resultsContainer = document.querySelector('#results');
            resultsContainer.innerHTML = `<div class="error">Error loading data: ${error.message}</div>`;
        }
    }
}

export { PropertyManager };