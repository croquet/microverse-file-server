#!/usr/bin/env node

/**
 * a barebones HTTP server in JS
 * originally by:
 *
 * @author zz85 https://github.com/zz85
 *
 * and modified by Croquet Corporation
 */

let port = 9685,
    http = require('http'),
    urlParser = require('url'),
    fs = require('fs'),
    path = require('path'),
    currentDir = process.cwd(),
    dns = require("dns");

let {networkInterfaces} = require("os");

let ind = process.argv.indexOf("--port");
if (ind >= 0) {
    let maybePort = parseInt(process.argv[ind + 1], 10);
    if (!Number.isNaN(maybePort) && maybePort) {
        port = maybePort;
    }
}

ind = process.argv.indexOf("--dir");
if (ind >= 0) {
    let maybeDir = process.argv[ind + 1];
    if (maybeDir) {
        currentDir = maybeDir;
    }
}

function fileTypes(name) {
    if (name.endsWith(".mjs")) {
       return "application/javascript";
    }
    if (name.endsWith(".js")) {
       return "application/javascript";
    }
    if (name.endsWith(".css")) {
       return "text/css";
    }
    if (name.endsWith(".png")) {
       return "image/png";
    }
    if (name.endsWith(".svg")) {
       return "image/svg+xml";
    }
    if (name.endsWith(".html")) {
       return "text/html";
    }
    if (name.endsWith(".pdf")) {
       return "application/pdf";
    }
    if (name.endsWith(".wasm")) {
       return "application/wasm";
    }
    return "application/octet-stream";
}

function header(type) {
    let base = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, PUT, PROPFIND",
        "Access-Control-Allow-Headers": "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range",
        "Access-Control-Max-Age": "0",
        "Cache-Control": "no-cache"
    };

    if (type) {
        base["Content-Type"] = type;
    }
    return base;
}

function get(request, response, pathname) {
    if (pathname.endsWith('/')) {pathname += 'index.html';}
    let filePath = path.join(currentDir, pathname);
    fs.stat(filePath, (err, stats) => {
        if (err) {
            response.writeHead(404, {});
            response.end('File not found!');
            return;
        }

        if (stats.isFile()) {
            fs.readFile(filePath, (resErr, data) => {
                if (resErr) {
                    response.writeHead(404, {});
                    response.end('Resource not found');
                    return;
                }

                let type = fileTypes(filePath);
                response.writeHead(200, header(type));
                response.write(data);
                response.end();
            });
        } else if (stats.isDirectory()) {
            fs.readdir(filePath, (error, files) => {
                if (error) {
                    response.writeHead(500, {});
                    response.end();
                    return;
                }

                if (!pathname.endsWith('/')) {pathname += '/';}
                response.writeHead(200, {'Content-Type': "text/html"});
                response.write('<!DOCTYPE html>\n<html><head><meta charset="UTF-8"><title>' + filePath + '</title></head><body>');
                response.write('<h1>' + filePath + '</h1>');
                response.write('<ul style="list-style:none;font-family:courier new;">');
                files.unshift('.', '..');
                files.forEach((item) => {
                    let urlpath = pathname + item,
                        itemStats = fs.statSync(currentDir + urlpath);
                    if (itemStats.isDirectory()) {
                        urlpath += '/';
                        item += '/';
                    }

                    response.write(`<li><a href="${urlpath}">${item}</a></li>`);
                });

                response.end('</ul></body></html>');
            });
        }
    });
}

function put(request, response, pathname) {
    let filePath = path.join(currentDir, pathname);
    let buf;
    request.on('data', (chunk) => {
        try {
            if (!buf) {
                buf = chunk;
            } else {
                buf = Buffer.concat([buf, chunk]);
            }
        } catch (e) {
            console.log(e);
        }
    });

    request.on('end', () => {
        let dirname = path.dirname(filePath);
        fs.mkdir(dirname, { recursive: true }, (err) => {
            if (err) {
                response.statusCode = 404;
                response.setHeader('Content-Type', 'text/html');
                response.end(`<h1>Cannot Create Directory</h1>\n<p>${dirname}</p>`);
                return;
            }

            fs.writeFile(filePath, buf, (writeErr) => {
                if (writeErr) {
                    response.statusCode = 404;
                    response.setHeader('Content-Type', 'text/html');
                    response.end(`<h1>Cannot Save File</h1>\n<p>${filePath}</p>`);
                    return;
                }
                console.log(filePath + ' saved (' + buf.length + ')');

                response.statusCode = 200;
                response.setHeader('Content-Type', 'text/plain');
                response.end('');
            });
        });
    });
}

function propfind(request, response, pathname) {
    let dirname = path.dirname(pathname);
    fs.stat(dirname, (err, stats) => {
        if (err) {
            console.log('error', err);
            response.statusCode = 404;
            response.setHeader('Content-Type', 'text/html');
            response.end(`<h1>Directory Not found</h1>\n<p>${dirname}</p>`);
            return;
        }
        if (!stats.isDirectory()) {
            response.statusCode = 404;
            response.setHeader('Content-Type', 'text/html');
            response.end(`<h1>Directory Not found</h1>\n<p>${dirname}</p>`);
            return;
        }

        fs.readdir(dirname, (readErr, list) => {
            if (readErr) {
                response.statusCode = 404;
                response.setHeader('Content-Type', 'text/html');
                response.end(`<h1>Cannot Read Directory</h1>\n<p>${dirname}</p>`);
                return;
            }
            response.statusCode = 200;
            response.setHeader('Content-Type', 'text/plain');
            response.end(JSON.stringify(list));
        });
    });
}

function handleRequest(request, response) {
    let urlObject = urlParser.parse(request.url, true);
    let pathname = decodeURIComponent(urlObject.pathname);
    let method = request.method;

    console.log(`[${(new Date()).toUTCString()}] "${method} ${pathname}"`);
    if (method === 'GET') {
        return get(request, response, pathname);
    }
    /*
    if (method === 'PUT') {
        return put(request, response, pathname);
    }
    if (method === 'PROPFIND') {
        return propfind(request, response, pathname);
    }
    */
    return null;
}

function displayAddresses() {
    function isLocalAddress(address) {
        let local_patterns = [
            // 10.0.0.0 - 10.255.255.255
            /^10(?:\.\d{1,3}){3}$/,
            // 127.0.0.0 - 127.255.255.255
            /^127(?:\.\d{1,3}){3}$/,
            // 169.254.1.0 - 169.254.254.255
            /^169\.254\.([1-9]|1?\d\d|2[0-4]\d|25[0-4])\.\d{1,3}$/,
            // 172.16.0.0 - 172.31.255.255
            /^(172\.1[6-9]|172\.2\d|172\.3[01])(?:\.\d{1,3}){2}$/,
            // 192.168.0.0 - 192.168.255.255
            /^192\.168(?:\.\d{1,3}){2}$/,
            // fc00::/7
            /^\[f[cd][\da-f]{2}(:?:[\da-f]{1,4}){1,7}\]$/,
            // fe80::/10
            // /^\[fe[89ab][\da-f](:?:[\da-f]{1,4}){1,7}\]$/, // unusable as URL
            // ::1
            /^\[::1\]$/,
        ];

        return local_patterns.some(pattern => pattern.test(address));
    }


    // https://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
    let interfaces = networkInterfaces();

    let results = [];

    for (let nets of Object.values(interfaces)) {
        for (let net of nets) {
            let v4 = net.family === (typeof net.family === "string" ? "IPv4" : 4);
            let address = v4 ? net.address : `[${net.address}]`;
            let external = !net.internal;
            let local = isLocalAddress(address);
            if (local) {
                results.push({v4, address, external});
            }
        }
    }

    results.sort((a, b) => {
        if (a.external && !b.external) return -1;
        if (!a.external && b.external) return 1;
        if (a.v4 && !b.v4) return -1;
        if (!a.v4 && b.v4) return 1;
        return 0;
    });

    let displayPort = (port === 80) ? "" : `:${port}`;
    console.log("Running at:");
    for (let {external, v4, address} of results) {
        let displayExternal = external ? "Local net" : "Host only";
        let displayV4 = v4 ? "IPv4" : "IPv6";
        console.log(`\t(${displayExternal} ${displayV4}) http://${address}${displayPort}`);
    }
}

http.createServer(handleRequest).listen(port);

console.log('The croquet file server server has started...');
console.log('Base directory at ' + currentDir);

displayAddresses();
