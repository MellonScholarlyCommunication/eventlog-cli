#!/usr/bin/env node

const http = require('http');
const fs = require('fs');

const host = 'localhost';
const port = 8000;

const requestListener = function (req, res) {
    const pathItem = req.url.substring(1);

    if (fs.lstatSync(`./data/${pathItem}`).isFile()) {
        const content = fs.readFileSync(`./data/${pathItem}`, { encoding: 'utf-8'});
        try {
            const headers = JSON.parse(fs.readFileSync(`./data/${pathItem}.meta`, { encoding : 'utf-8'}));
            Object.keys(headers).forEach( (key) => {
                res.setHeader(key, headers[key]);
            });
        }
        catch(e) {}
        res.writeHead(200);
        res.end(content);
    }
    else {
        res.writeHead(404);
        res.end(`No such path: ${pathItem}`);
    }
}

const server = http.createServer(requestListener);

server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port}`);
});