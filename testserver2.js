const http = require('http');
const url = require('url');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const {proxy} = require('./proxy');

// Initialize SQLite database
const dbPath = path.join(__dirname, 'properties.db');
const db = new sqlite3.Database(dbPath);
const GRAPHQL_API_URL = 'https://api-public.prod.furnishedfinder.com';


// Create tables if they don't exist
db.serialize(() => {
    // Seen homes table
    db.run(`CREATE TABLE IF NOT EXISTS seen_homes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_url TEXT UNIQUE NOT NULL,
        property_name TEXT,
        listing_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Favorite homes table
    db.run(`CREATE TABLE IF NOT EXISTS favorite_homes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        property_url TEXT UNIQUE NOT NULL,
        property_name TEXT,
        listing_id TEXT,
        property_data TEXT, -- JSON string of the full property data
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

// Helper function to parse JSON body
function parseJSONBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                resolve(JSON.parse(body));
            } catch (error) {
                reject(error);
            }
        });
    });
}

// Helper function to send JSON response
function sendJSON(res, statusCode, data) {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end(JSON.stringify(data));
}

// API Routes
const routes = {
    // Mark a home as seen
    'POST /api/homes/seen': async (req, res) => {
        try {
            const { property_url, property_name, listing_id } = await parseJSONBody(req);
            
            if (!property_url) {
                return sendJSON(res, 400, { error: 'property_url is required' });
            }

            db.run(
                `INSERT OR IGNORE INTO seen_homes (property_url, property_name, listing_id) VALUES (?, ?, ?)`,
                [property_url, property_name || null, listing_id || null],
                function(err) {
                    if (err) {
                        console.error('Error marking home as seen:', err);
                        return sendJSON(res, 500, { error: 'Database error' });
                    }
                    
                    if (this.changes > 0) {
                        sendJSON(res, 201, { 
                            message: 'Home marked as seen',
                            id: this.lastID 
                        });
                    } else {
                        sendJSON(res, 200, { 
                            message: 'Home was already marked as seen' 
                        });
                    }
                }
            );
        } catch (error) {
            console.error('Error parsing request:', error);
            sendJSON(res, 400, { error: 'Invalid JSON' });
        }
    },

    // Get all seen homes
    'GET /api/homes/seen': (req, res) => {
        db.all(`SELECT * FROM seen_homes ORDER BY created_at DESC`, (err, rows) => {
            if (err) {
                console.error('Error fetching seen homes:', err);
                return sendJSON(res, 500, { error: 'Database error' });
            }
            sendJSON(res, 200, { seen_homes: rows });
        });
    },

    // Add a home to favorites
    'POST /api/homes/favorites': async (req, res) => {
        try {
            const { property_url, property_name, listing_id, property_data } = await parseJSONBody(req);
            
            if (!property_url) {
                return sendJSON(res, 400, { error: 'property_url is required' });
            }

            const propertyDataString = property_data ? JSON.stringify(property_data) : null;

            db.run(
                `INSERT OR REPLACE INTO favorite_homes (property_url, property_name, listing_id, property_data) VALUES (?, ?, ?, ?)`,
                [property_url, property_name || null, listing_id || null, propertyDataString],
                function(err) {
                    if (err) {
                        console.error('Error adding to favorites:', err);
                        return sendJSON(res, 500, { error: 'Database error' });
                    }
                    
                    sendJSON(res, 201, { 
                        message: 'Home added to favorites',
                        id: this.lastID 
                    });
                }
            );
        } catch (error) {
            console.error('Error parsing request:', error);
            sendJSON(res, 400, { error: 'Invalid JSON' });
        }
    },

    // Get all favorite homes
    'GET /api/homes/favorites': (req, res) => {
        db.all(`SELECT * FROM favorite_homes ORDER BY created_at DESC`, (err, rows) => {
            if (err) {
                console.error('Error fetching favorites:', err);
                return sendJSON(res, 500, { error: 'Database error' });
            }
            
            // Parse property_data JSON for each row
            const favorites = rows.map(row => ({
                ...row,
                property_data: row.property_data ? JSON.parse(row.property_data) : null
            }));
            
            sendJSON(res, 200, { favorites });
        });
    },

    // Remove a home from favorites
    'DELETE /api/homes/favorites': async (req, res) => {
        try {
            const { property_url } = await parseJSONBody(req);
            
            if (!property_url) {
                return sendJSON(res, 400, { error: 'property_url is required' });
            }

            db.run(
                `DELETE FROM favorite_homes WHERE property_url = ?`,
                [property_url],
                function(err) {
                    if (err) {
                        console.error('Error removing from favorites:', err);
                        return sendJSON(res, 500, { error: 'Database error' });
                    }
                    
                    if (this.changes > 0) {
                        sendJSON(res, 200, { message: 'Home removed from favorites' });
                    } else {
                        sendJSON(res, 404, { error: 'Home not found in favorites' });
                    }
                }
            );
        } catch (error) {
            console.error('Error parsing request:', error);
            sendJSON(res, 400, { error: 'Invalid JSON' });
        }
    },

    // Check if a home is seen or favorited
    'GET /api/homes/status': (req, res) => {
        const urlParts = url.parse(req.url, true);
        const property_url = urlParts.query.property_url;
        
        if (!property_url) {
            return sendJSON(res, 400, { error: 'property_url parameter is required' });
        }

        // Check both tables
        const checkSeen = new Promise((resolve, reject) => {
            db.get(`SELECT 1 FROM seen_homes WHERE property_url = ?`, [property_url], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });

        const checkFavorite = new Promise((resolve, reject) => {
            db.get(`SELECT 1 FROM favorite_homes WHERE property_url = ?`, [property_url], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });

        Promise.all([checkSeen, checkFavorite])
            .then(([is_seen, is_favorite]) => {
                sendJSON(res, 200, {
                    property_url,
                    is_seen,
                    is_favorite
                });
            })
            .catch(err => {
                console.error('Error checking home status:', err);
                sendJSON(res, 500, { error: 'Database error' });
            });
    }
};


// Main server
const server = http.createServer(async function(req, res) {
    const method = req.method;
    const urlPath = url.parse(req.url).pathname;
    const routeKey = `${method} ${urlPath}`;

    console.log(`${new Date().toISOString()} - ${method} ${urlPath}`);

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(200, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
        });
        return res.end();
    }

    // Route handling
    if (routes[routeKey]) {
        routes[routeKey](req, res);
    } else if (urlPath === '/graphql' && method === 'POST') {
        console.log(`Proxying GraphQL request to: ${GRAPHQL_API_URL}${req.url}`);
        
        // Proxy the request with explicit target
        proxy.web(req, res, { 
            target: GRAPHQL_API_URL
        });
    } else {
        // Serve the index.html file for other requests
        const savedUrl = req.url === "/" ? 'index.html' : req.url.substring(1)
        const filePath = path.join(__dirname, savedUrl);

        fs.readFile(filePath, (err, data) => {
            if (err) {
                console.error('Error serving index.html:', err);
                if (err.code === 'ENOENT') {
                    res.writeHead(404, { 
                        'Content-Type': 'text/plain',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end('index.html not found');
                } else {
                    res.writeHead(500, { 
                        'Content-Type': 'text/plain',
                        'Access-Control-Allow-Origin': '*'
                    });
                    res.end(`Server Error: ${err.code}`);
                }
            } else {
                const mime = req.url.includes(".js") ? "text/javascript" : 'text/html'
                res.writeHead(200, { 
                    'Content-Type': mime,
                    'Access-Control-Allow-Origin': '*'
                });
                res.end(data);
            }
        });
    }
});

// Handle server errors
server.on('error', (err) => {
    console.error('Server error:', err);
});

const PORT = process.env.PORT || 8000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Database initialized at: ${dbPath}`);
    console.log('\nAvailable API endpoints:');
    console.log('- POST /api/homes/seen - Mark a home as seen');
    console.log('- GET /api/homes/seen - Get all seen homes');
    console.log('- POST /api/homes/favorites - Add home to favorites');
    console.log('- GET /api/homes/favorites - Get all favorite homes');
    console.log('- DELETE /api/homes/favorites - Remove home from favorites');
    console.log('- GET /api/homes/status?property_url=... - Check if home is seen/favorited');
    console.log('- POST /graphql - GraphQL proxy');
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\nShutting down server...');
    db.close((err) => {
        if (err) {
            console.error('Error closing database:', err);
        } else {
            console.log('Database connection closed.');
        }
        process.exit(0);
    });
});