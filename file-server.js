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
    // https://stackoverflow.com/questions/3653065/get-local-ip-address-in-node-js
    let nets = networkInterfaces();

    let results = {};

    for (let name of Object.keys(nets)) {
        for (let net of nets[name]) {
            let isV4 = net.family === (typeof net.family === "string" ? "IPv4" : 4);
            if (!results[name]) {
                results[name] = [];
            }
            results[name].push({isV4, address: net.address, internal: net.internal});
        }
    }

    function isInternal(entries) {
        for (let i = 0; i < entries.length; i++) {
            let entry = entries[i];
            if (entry.internal) {return true;}
        }
        return false;
    }

    function isPrivateAddress(address) {
        let local_patterns = [
            // 10.0.0.0 - 10.255.255.255
            /^(::ffff:)?10(?:\.\d{1,3}){3}$/,
            // 127.0.0.0 - 127.255.255.255
            /^(::ffff:)?127(?:\.\d{1,3}){3}$/,
            // 169.254.1.0 - 169.254.254.255
            /^(::f{4}:)?169\.254\.([1-9]|1?\d\d|2[0-4]\d|25[0-4])\.\d{1,3}$/,
            // 172.16.0.0 - 172.31.255.255
            /^(::ffff:)?(172\.1[6-9]|172\.2\d|172\.3[01])(?:\.\d{1,3}){2}$/,
            // 192.168.0.0 - 192.168.255.255
            /^(::ffff:)?192\.168(?:\.\d{1,3}){2}$/,
            // ::1
            /^::1$/,
        ];

        for (let i = 0; i < local_patterns.length; i++) {
            if (local_patterns[i].test(address)) {return true;}
        }
        return false;
    }

    function isPrivate(entries) {
        for (let i = 0; i < entries.length; i++) {
            let entry = entries[i];
            if (isPrivateAddress(entry.address)) {return true;}
        }
        return false;
    }

    let displayPort = (port === 80) ? "" : `:${port}`;
    console.log("Running at:");
    for (let name of Object.keys(results)) {
        let entries = results[name];
        let internal = isInternal(entries);
        let private = isPrivate(entries);
        if (internal || private) {
            entries.forEach((entry) => {
                if (!entry.isV4) {return;}
                console.log(`\thttp://${entry.address}${displayPort}`);
            });
        }
    }
    console.log(`\thttp://[::1]${displayPort}`);
}

http.createServer(handleRequest).listen(port);

console.log('The croquet file server server has started...');
console.log('Base directory at ' + currentDir);

displayAddresses();
