// San Francisco coordinates
const SF_CENTER = [37.7749, -122.4194];
const SF_BOUNDS = [
    [37.7049, -122.5151], // Southwest
    [37.8299, -122.3551]  // Northeast
];

class MapManager {
    constructor() {
        this.map = null;
        this.drawingMode = false;
        this.currentRectangle = null;
        this.startPoint = null;
        this.propertyMarkers = [];
        this.propertyMarkersLayer = null;
        
        // Callback for when bounds change - set by parent application
        this.onBoundsChange = null;
        this.onMarkerClicked = null;
    }

    init() {
        this.initMap();
        this.setupEventListeners();
        this.updateStatus('Map loaded - ready to draw search area');
    }

    initMap() {
        this.map = L.map('map').setView(SF_CENTER, 12);

        // Add multiple tile layer options for better reliability
        const tileLayer = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        });

        // Fallback tile layer
        const fallbackTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            subdomains: 'abcd',
            maxZoom: 20
        });

        // Try primary, fallback to secondary
        tileLayer.addTo(this.map);
        tileLayer.on('tileerror', () => {
            console.log('Primary tiles failed, switching to fallback');
            this.map.removeLayer(tileLayer);
            fallbackTileLayer.addTo(this.map);
        });

        // Add SF boundary indicator (optional visual guide)
        const sfBoundary = L.rectangle(SF_BOUNDS, {
            color: '#007bff',
            weight: 2,
            opacity: 0.3,
            fillOpacity: 0.1,
            dashArray: '10, 10'
        }).addTo(this.map);

        // Create layer for property markers
        this.propertyMarkersLayer = L.layerGroup().addTo(this.map);

        this.setupMapEvents();
    }

    setupMapEvents() {
        // Use container events to properly handle drawing vs map interaction
        const mapContainer = this.map.getContainer();

        mapContainer.addEventListener('mousedown', (e) => this.onMouseDown(e), true);
        mapContainer.addEventListener('mousemove', (e) => this.onMouseMove(e), true);
        mapContainer.addEventListener('mouseup', (e) => this.onMouseUp(e), true);
    }

    setupEventListeners() {
        document.getElementById('drawBtn').addEventListener('click', () => this.startDrawing());
        document.getElementById('clearBtn').addEventListener('click', () => this.clearArea());
        
        // Escape key to cancel drawing
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.drawingMode) {
                this.stopDrawing();
                this.updateStatus('Drawing cancelled');
            }
        });
    }

    onMouseDown(e) {
        if (!this.drawingMode) return;

        // Prevent map dragging when in drawing mode
        e.preventDefault();
        e.stopPropagation();
        this.map.dragging.disable();

        // Convert screen coordinates to lat/lng
        const rect = this.map.getContainer().getBoundingClientRect();
        const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
        this.startPoint = this.map.containerPointToLatLng(point);

        // Clear existing rectangle
        if (this.currentRectangle) {
            this.map.removeLayer(this.currentRectangle);
        }

        // Create new rectangle
        this.currentRectangle = L.rectangle([this.startPoint, this.startPoint], {
            color: '#28a745',
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.2
        }).addTo(this.map);

        this.updateStatus('Drawing rectangle... release mouse to finish');
    }

    onMouseMove(e) {
        if (!this.drawingMode || !this.startPoint || !this.currentRectangle) return;

        e.preventDefault();
        e.stopPropagation();

        // Convert screen coordinates to lat/lng
        const rect = this.map.getContainer().getBoundingClientRect();
        const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
        const currentPoint = this.map.containerPointToLatLng(point);

        // Update rectangle bounds
        const bounds = L.latLngBounds(this.startPoint, currentPoint);
        this.currentRectangle.setBounds(bounds);
    }

    onMouseUp(e) {
        if (!this.drawingMode || !this.startPoint || !this.currentRectangle) return;

        e.preventDefault();
        e.stopPropagation();

        // Re-enable map dragging
        this.map.dragging.enable();

        // Convert screen coordinates to lat/lng
        const rect = this.map.getContainer().getBoundingClientRect();
        const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
        const endPoint = this.map.containerPointToLatLng(point);

        const bounds = L.latLngBounds(this.startPoint, endPoint);

        // Get coordinates
        const coords = {
            northEast: {
                lat: bounds.getNorthEast().lat,
                lng: bounds.getNorthEast().lng
            },
            southWest: {
                lat: bounds.getSouthWest().lat,
                lng: bounds.getSouthWest().lng
            },
            center: {
                lat: bounds.getCenter().lat,
                lng: bounds.getCenter().lng
            }
        };

        // Log to console
        console.log('Search Area Coordinates:', coords);
        console.log('Bounding Box:', {
            north: coords.northEast.lat,
            south: coords.southWest.lat,
            east: coords.northEast.lng,
            west: coords.southWest.lng
        });

        // Notify property manager of bounds change
        if (this.onBoundsChange) {
            this.onBoundsChange(coords);
        }

        // Update UI
        this.stopDrawing();
        this.updateStatus('Search area defined! Check console for coordinates.');
        document.getElementById('clearBtn').disabled = false;
    }

    startDrawing() {
        this.drawingMode = true;
        this.map.getContainer().style.cursor = 'crosshair';
        document.getElementById('drawBtn').disabled = true;
        document.getElementById('instructions').style.display = 'block';
        this.updateStatus('Drawing mode active - click and drag to draw rectangle');
    }

    stopDrawing() {
        this.drawingMode = false;
        this.startPoint = null;
        this.map.getContainer().style.cursor = '';
        this.map.dragging.enable(); // Ensure dragging is re-enabled
        document.getElementById('drawBtn').disabled = false;
        document.getElementById('instructions').style.display = 'none';
    }

    clearArea() {
        if (this.currentRectangle) {
            this.map.removeLayer(this.currentRectangle);
            this.currentRectangle = null;
        }

        document.getElementById('clearBtn').disabled = true;
        this.updateStatus('Search area cleared');

        console.log('Search area cleared');
    }

    updateStatus(message) {
        document.getElementById('status').textContent = message;
    }

    // Method to update property markers on the map
    updatePropertyMarkers(properties) {
        // Clear existing markers
        this.propertyMarkersLayer.clearLayers();

        const onMarkerClicked = this.onMarkerClicked;

        // Add new markers for properties with location data
        properties.forEach(property => {
            if (property.approxLocation && property.approxLocation.latitude && property.approxLocation.longitude) {
                const marker = L.marker([
                    property.approxLocation.latitude,
                    property.approxLocation.longitude
                ]).bindPopup(`
                    <div>
                        <h4>${property.name || 'Unnamed Property'}</h4>
                        <p>Rent: $${property.rentAmount?.amount || 'N/A'}</p>
                        <p>Bedrooms: ${property.bedroomCount || 'N/A'}</p>
                        <p>Bathrooms: ${property.bathroomCount || 'N/A'}</p>
                    </div>
                `).on('click', function(e) {
                    // This function runs when the marker is clicked
                    console.log('Marker clicked!', property);
                    onMarkerClicked(property)
                    // You have access to both the event (e) and the property object
                    // Do whatever you need with the property data
                });

                this.propertyMarkersLayer.addLayer(marker);
            }
        });

        console.log(`Updated ${properties.length} property markers on map`);
    }

    // Method to get current map bounds (if needed)
    getCurrentBounds() {
        if (!this.map) return null;
        
        const bounds = this.map.getBounds();
        return {
            northEast: {
                lat: bounds.getNorthEast().lat,
                lng: bounds.getNorthEast().lng
            },
            southWest: {
                lat: bounds.getSouthWest().lat,
                lng: bounds.getSouthWest().lng
            },
            center: {
                lat: bounds.getCenter().lat,
                lng: bounds.getCenter().lng
            }
        };
    }
}

export { MapManager };