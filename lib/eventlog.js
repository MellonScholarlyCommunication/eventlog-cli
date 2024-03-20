const fetch = require('node-fetch');
const parse = require('parse-link-header');
const canonize = require('rdf-canonize');
const rdfParser = require("rdf-parse").default;
const QueryEngine = require('@comunica/query-sparql').QueryEngine;

const myEngine = new QueryEngine();
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

async function getLog(url) {
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

async function getEvent(url, subject) {
    subject = (typeof subject !== 'undefined') ? subject : await getEventSubject(url);

    if (!subject) {
        return null;
    }

    return new Promise( async(resolve) =>  {
        const bindingsStream = await myEngine.queryBindings(`
                PREFIX as: <https://www.w3.org/ns/activitystreams#> 
                SELECT ?type ?actor ?object ?context WHERE {
                    <${subject}> 
                        a ?type ;
                        as:actor ?actor ;
                        as:object ?object .
                    OPTIONAL {
                        <${subject}> as:context ?context 
                    }
                }`, {
            sources: [url],
        });

        let record = {};

        bindingsStream.on('data', (binding) => {
            const type    = binding.get('type').value;
            const actor   = binding.get('actor').value;
            const object  = binding.get('object').value;
            const context = binding.get('context').value;

            record = {
                type: type ,
                actor: actor ,
                object: object ,
                context: context 
            };
        });

        bindingsStream.on('end', () => {
            resolve(record);
        });
    });
}

async function canonizeEvent(url) {
    return new Promise( async(resolve) =>  {
        try {
            const result = await fetch(url, { method : 'GET' });

            if (! result.ok) {
                resolve(null);
            }

            const body = await result.text();

            const textStream = require('streamify-string')(body);

            const dataset = [];

            rdfParser.parse(textStream, { path: url })
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

module.exports = { discoverLog, getLog , getEventSubject , getEvent , canonizeEvent };