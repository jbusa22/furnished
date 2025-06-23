const httpProxy = require('http-proxy');

// Create a proxy server instance
const proxy = httpProxy.createProxyServer({
    changeOrigin: true,
    secure: true,
    timeout: 30000,
    proxyTimeout: 30000
});

// Handle proxy errors
proxy.on('error', function (err, req, res) {
    console.error('Proxy error:', err.message);
    console.error('Request URL:', req.url);
    console.error('Request method:', req.method);
    
    if (!res.headersSent) {
        res.writeHead(500, {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({ 
            error: 'Proxy error', 
            message: err.message 
        }));
    }
});

proxy.on('proxyReq', function(proxyReq, req, res, options) {
    console.log('\n=== PROXY REQUEST DEBUG ===');
    console.log('Method:', req.method);
    console.log('Original URL:', req.url);
    console.log('Target:', options.target);
    console.log('Full target URL:', options.target + req.url);
    
    // Only log headers, don't try to access them yet
    console.log('Request has headers:', Object.keys(req.headers));

    // Remove problematic browser headers BEFORE they're processed by the proxy
    const headersToRemove = [
        'sec-fetch-dest',
        'sec-fetch-mode', 
        'sec-fetch-site',
        'sec-ch-ua-mobile',
        'sec-ch-ua',
        'sec-ch-ua-platform',
        'origin',
        'referer'
    ];

    // Remove headers from the original request before proxy processes them
    headersToRemove.forEach(header => {
        if (req.headers[header]) {
            delete req.headers[header];
            console.log(`Removed header from request: ${header}`);
        }
    });

    console.log('Cleaned request headers:', Object.keys(req.headers));
    console.log('=== END PROXY REQUEST DEBUG ===\n');
});

// Add response logging
proxy.on('proxyRes', function(proxyRes, req, res) {
    console.log('\n=== PROXY RESPONSE DEBUG ===');
    console.log('Status:', proxyRes.statusCode, proxyRes.statusMessage);
    console.log('Response headers count:', Object.keys(proxyRes.headers).length);
    
    // Add CORS headers to the proxy response headers (before they're sent)
    proxyRes.headers['access-control-allow-origin'] = '*';
    proxyRes.headers['access-control-allow-methods'] = 'GET, POST, OPTIONS';
    proxyRes.headers['access-control-allow-headers'] = 'Content-Type, Authorization';
    
    console.log('=== END PROXY RESPONSE DEBUG ===\n');
});

module.exports = {
    proxy
}