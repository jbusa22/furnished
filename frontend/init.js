import { MapManager } from './map.js';
import { PropertyManager } from './propertyManager.js';

class Application {
    constructor() {
        this.mapManager = null;
        this.propertyManager = null;
    }

    async initialize() {
        try {
            // Initialize property manager first
            this.propertyManager = new PropertyManager();
            
            // Initialize map manager and set up communication
            this.mapManager = new MapManager();
            this.mapManager.init();
            
            // Set up bidirectional communication
            this.setupCommunication();
            
            // Initialize both modules
            await this.propertyManager.init();
           
            
            console.log('Application initialized successfully');
        } catch (error) {
            console.error('Error initializing application:', error);
        }
    }

    setupCommunication() {
        // Map tells property manager when bounds change
        this.mapManager.onBoundsChange = (bounds) => {
            this.propertyManager.updateSearchBounds(bounds);
        };

        // Property manager tells map where to show property markers
        this.propertyManager.onPropertiesUpdate = (properties) => {
            this.mapManager.updatePropertyMarkers(properties);
        };
        this.mapManager.onMarkerClicked = (property) => {
            this.propertyManager.scrollToProperty(property);
        };
    }
}

// Initialize the app when page loads
document.addEventListener('DOMContentLoaded', async () => {
    const app = new Application();
    await app.initialize();
});
