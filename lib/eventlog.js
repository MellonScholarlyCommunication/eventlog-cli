const fetch = require('node-fetch');
const parse = require('parse-link-header');
const canonize = require('rdf-canonize');
const rdfParser = require("rdf-parse").default;

const EVENT_LOG_RELATION = [
    'eventlog',
    'https://w3id.org/ldes#EventStream'
];

async function discoverLog(url,artifact) {
    try {
        const result = await fetch(url, {
            method: 'HEAD'
        });

        if (!result.ok) {
            return null;
        }

        const linkHeader = result.headers.get('link');

        if (linkHeader) {
            const parsedLinkHeaders = parse(linkHeader);

            for (let i = 0 ; i < EVENT_LOG_RELATION.length ; i++) {
                const rel = EVENT_LOG_RELATION[i];
            
                if (parsedLinkHeaders[rel]) {
                    return parsedLinkHeaders[rel]['url'];
                }
            }
        }

        const linkTemplateHeader = result.headers.get('link-template');

        if (linkTemplateHeader) {
            for (let i = 0 ; i < EVENT_LOG_RELATION.length ; i++) {
                const rel = EVENT_LOG_RELATION[i];
                const regex = new RegExp(`"([^"]+)"\\s+;\\s+rel="${rel}"`);
                const match = regex.exec(linkTemplateHeader);

                if (match) {
                    const template = match[1];

                    if (artifact) {
                        return template.replace(/{[^}]+}/,artifact);
                    }
                    else {
                        return template;
                    }
                }
            }
        }

        return null;
    }
    catch (e) {
        return null;
    }
}

async function listEvents(url) {
    return new Promise( async(resolve) =>  {
        try {
            const members = [];
            const bindingsStream = await myEngine.queryBindings(`
                PREFIX ldes: <https://w3id.org/ldes#> 
                PREFIX tree: <https://w3id.org/tree#> 
                SELECT ?member WHERE {
                    ?ldes a ldes:EventStream ;
                          tree:member ?member .
                }`, {
                sources: [url],
            });

            bindingsStream.on('data', (binding) => {
                members.push(binding.get('member').value);
            });
            bindingsStream.on('end', () => {
                resolve(members);
            });
        }
        catch (e) {
            resolve(null);
        }
    });
}

async function getEventSubject(url) {
    return new Promise( async(resolve) =>  {
        try {
            const result = await fetch(url, { method: 'GET' });

            if (! result.ok) {
                resolve(null);
            }

            const body = await result.text();

            const textStream = require('streamify-string')(body);

            const subjects = {};
            const objects = {};

            rdfParser.parse(textStream, { path: url })
                .on('data', (quad) => {
                    subjects[quad.subject.value] = 1;
                    objects[quad.object.value] = 1;
                })
                .on('error', (error) => resolve(null))
                .on('end', () => {
                    Object.keys(subjects).forEach( (key) => {
                        if (!objects[key]) {
                            resolve(key);
                        }
                    });
                    resolve(null);
                });
        }
        catch (e) {
            console.error(e);
            resolve(null);
        }
    });
}

async function getEvent(url) {
    try {
        const result = await fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/ld+json'
            }
        });

        if (! result.ok) {
            return null;
        }

        const body = await result.text();
        const data = JSON.parse(body);

        const id      = data['id'];
        const type    = data['type'];
        const actor   = data['actor']['id'];
        const object  = data['object']['id'];
        let context;

        if (data['context']) {
            if (typeof data['context'] === 'object') {
                context = data['context']['id'];
            }
            else {
                context = data['context'];
            }
        }

        return {
            id : id ,
            type : type ,
            actor : actor ,
            context : context ,
            object : object ,
            _body : body,
        };
    }
    catch (e) {
        return null;
    }
}

async function canonizeEvent(jsonld) {
    return new Promise( async(resolve) =>  {
        try {
            const textStream = require('streamify-string')(jsonld);

            const dataset = [];

            rdfParser.parse(textStream, { path: 'file.jsonld' })
                .on('data', (quad) => {
                    dataset.push(quad);
                })
                .on('error', (error) => resolve(null))
                .on('end', async () => {
                    const canonical = await canonize.canonize(dataset, {algorithm: 'RDFC-1.0'});
                    resolve(canonical);
                });
        }
        catch (e) {
            console.error(e);
            resolve(null);
        }
    });
}

module.exports = { discoverLog, listEvents , getEventSubject , getEvent , canonizeEvent };