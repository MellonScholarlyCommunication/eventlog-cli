#!/usr/bin/env node

const http = require('http');
const fs = require('fs');

const host = 'localhost';
const port = 8000;
const public_dir = './public';

const log4js = require('log4js');
const logger = log4js.getLogger();

log4js.configure({
    appenders: {
      stderr: { type: 'stderr' }
    },
    categories: {
      default: { appenders: ['stderr'], level: process.env.LOG4JS ?? 'INFO' }
    }
});

const requestListener = function (req, res) {
    const pathItem = req.url.substring(1);

    try {
        const exists = fs.existsSync(`${public_dir}/${pathItem}`);

        if (!exists) {
            res.writeHead(404);
            res.end(`No such path: ${pathItem}`);
            logger.info(`${req.method} ${req.url} [404] 0`); 
            return;
        }
        
        const stat = fs.lstatSync(`${public_dir}/${pathItem}`);
        if (stat && stat.isFile()) {
            const content = fs.readFileSync(`${public_dir}/${pathItem}`, { encoding: 'utf-8'});
            if (fs.existsSync(`${public_dir}/${pathItem}.meta`)) {
                const headers = JSON.parse(fs.readFileSync(`${public_dir}/${pathItem}.meta`, { encoding : 'utf-8'}));
                Object.keys(headers).forEach( (key) => {
                    res.setHeader(key, headers[key]);
                });
            }
            res.writeHead(200);
            res.end(content);
            logger.info(`${req.method} ${req.url} [200] ${content.length}`);
        }
        else if (stat && stat.isDirectory()) {
            const lsDir = fs.readdirSync(`${public_dir}/${pathItem}`);

            if (fs.existsSync(`${public_dir}/${pathItem}.meta`)) {
                const headers = JSON.parse(fs.readFileSync(`${public_dir}/${pathItem}.meta`, { encoding : 'utf-8'}));
                Object.keys(headers).forEach( (key) => {
                    res.setHeader(key, headers[key]);
                });
            }
            else {
                res.setHeader('Content-Type','text/html');
            }

            let content = '<html><body>';
            lsDir.forEach( (entry) => {
                content += `<a href="http://${host}:${port}/${pathItem}/${entry}">${entry}</a><br>`
            });
            content += '</body></html>';
            res.writeHead(200);
            res.end(content); 
            logger.info(`${req.method} ${req.url} [200] ${content.length}`);
        }
        else {
            res.writeHead(404);
            res.end(`No such path: ${pathItem}`);
            logger.info(`${req.method} ${req.url} [404] 0`);
        }
    }
    catch(e) {
        res.writeHead(500)
        res.end(e.message);
        logger.info(`${req.method} ${req.url} [500] 0`);
    }
}

const server = http.createServer(requestListener);

server.listen(port, host, () => {
    console.log(`Server is running on http://${host}:${port} for ${public_dir}`);
});