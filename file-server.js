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
    rootDir = process.cwd(),
    cors = true,
    label = "",
    http = require('http'),
    urlParser = require('url'),
    fs = require('fs'),
    path = require('path');

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
        rootDir = maybeDir;
    }
}

ind = process.argv.indexOf("--label");
if (ind >= 0) {
    let maybeLabel = process.argv[ind + 1];
    if (maybeLabel) {
        label = `${maybeLabel}: `;
    }
}

ind = process.argv.indexOf("--no-cors");
if (ind >= 0) {
    cors = false;
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
    let headers = {
        "Cache-Control": "no-cache",
    };

    if (cors) {
        headers["Access-Control-Allow-Origin"] = "*";
        headers["Access-Control-Allow-Methods"] = "GET,PUT,PROPFIND";
        headers["Access-Control-Allow-Headers"] = "DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range";
        headers["Access-Control-Max-Age"] = "0";
    }

    if (type) {
        headers["Content-Type"] = type;
    }

    return headers;
}

function get(request, response, pathname) {
    if (pathname.endsWith('/')) {pathname += 'index.html';}
    let filePath = path.join(rootDir, pathname);
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
                        itemStats = fs.statSync(rootDir + urlpath);
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
    let filePath = path.join(rootDir, pathname);
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

    console.log(`[${(new Date()).toUTCString()}] ${label}"${method} ${pathname}"`);
    if (method === 'GET' || method === 'HEAD') {
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
    let interfaces = networkInterfaces();

    let results = [];
    let order = {};

    // we want at most one IPv4 and one IPv6 address per interface
    // but need to exclude link-local addresses
    for (let [name, interface] of Object.entries(interfaces)) {
        let families = {};
        for (let { family, internal, address } of interface) {
            if (typeof family === "number") family = `IPv${family}`;
            if (family in families) continue;
            let linkLocal = /^fe[89ab]/.test(address);
            if (linkLocal) continue;
            results.push({name, family, address, internal});
            families[family] = true;
        }
        order[name] = results.length;
    }

    // list external IPv4 first
    results.sort((a, b) => {
        if (a.internal < b.internal) return -1;
        if (a.internal > b.internal) return 1;
        if (order[a.name] < order[b.name]) return -1;
        if (order[a.name] > order[b.name]) return 1;
        if (a.family < b.family) return -1;
        if (a.family > b.family) return 1;
        return 0;
    });

    let displayPort = (port === 80) ? "" : `:${port}`;
    for (let {name, internal, family, address} of results) {
        let net = internal ? "Host only" :  "Network";
        let displayAddress = family === "IPv6" ? `[${address}]` : address;
        console.log(`${label}(${net} ${family} "${name}") http://${displayAddress}${displayPort}`);
    }
}

http.createServer(handleRequest).listen(port);

console.log(`${label}serving ${rootDir}`);

displayAddresses();
