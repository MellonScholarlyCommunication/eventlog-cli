const fetch = require('node-fetch');
const LinkHeader = require('http-link-header');
const canonize = require('rdf-canonize');
const rdfParser = require('rdf-parse').default;
const N3 = require('n3');
const Memento = require('memento-cli');
const { createHash } = require('crypto');

const EVENT_LOG_RELATION = [
    'eventlog',
    'https://w3id.org/ldes#EventStream'
];

async function discoverLog(url,artifact) {
    try {
        const headers = await fetchHeaders(url);

        if (!headers) {
            return null;
        }

        const linkHeader = headers.get('link');

        if (linkHeader) {
            const parsedLinkHeaders = LinkHeader.parse(linkHeader);

            for (let i = 0 ; i < EVENT_LOG_RELATION.length ; i++) {
                const rel = EVENT_LOG_RELATION[i];
            
                if (parsedLinkHeaders.get('rel',rel)) {
                    return parsedLinkHeaders.get('rel',rel)[0]['uri'];
                }
            }
        }

        const linkTemplateHeader = headers.get('link-template');

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
    try {
        const data = JSON.parse(await fetchJsonLD(url));
        return data['member'];
    }
    catch (e) {
       return null;
    }
}

async function getEvent(url) {
    try {
        const body = await fetchJsonLD(url);
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

async function listEventMementos(url) {
    try {
        const headers = await fetchHeaders(url);

        const linkHeader = headers.get('link');

        if (!linkHeader) {
            return null;
        }
        
        const parsedLinkHeaders = LinkHeader.parse(linkHeader);

        if (!parsedLinkHeaders.get('rel','timemap')) {
            return null;
        }

        const timeMaps = parsedLinkHeaders.get('rel','timemap').map( (item) => item['uri']); 

        const result = [];

        for (let i = 0 ; i < timeMaps.length ; i++) {
            const mementos = await Memento.memento(timeMaps[i], { timemap: true} );

            mementos.forEach( (m) => result.push(m));
        }

        return result;
    }
    catch (e) {
        return null;
    }
}

async function crawlEvent(artifact,url) {
    const store = new N3.Store();
    const eventlog = await discoverLog(artifact);

    if (!eventlog) {
        return;
    }

    // Add some metadata
    await turtlePrint(`
<${artifact}>
  a ev:Artifact ;
  ev:eventlog <${eventlog}> ;
  ev:hasEvent <${url}> .

<${url}>
  a ev:Event , ev:DataNodeEvent .
`,null,store);

    await _crawlEvent(artifact,url,store);

    // Fetch the Event Log JSON-LD
    const eventlog_jsonld = await fetchJsonLD(eventlog);

    if (eventlog_jsonld) {
        await jsonldPrint(eventlog_jsonld,eventlog,store);
    }

    // Find the mementos of the eventlog
    await _crawlEvent_ArchiveNode(eventlog,store);

    return store;
}

const CRAWL_SEEN = {};

async function _crawlEvent(artifact,url,store) {
    if (artifact && url) { 
        // ok 
    }
    else {
        return;
    }

    // Prevent going in a loop
    if (CRAWL_SEEN[url]) {
        return;
    }
    else {
        CRAWL_SEEN[url] = 1;
    }

    // Read and parse the Event Log entry
    const dn_event = await getEvent(url);

    if (! dn_event) {
        return;
    }

    // Calculate a checksum for this entry
    const canonical = await canonizeEvent(dn_event['_body']);

    if (canonical) {
        const canonical_256 = sha256(canonical);

        // Add some metadata
        await turtlePrint(`<${url}> dataid:checksum "${canonical_256}" .`, null, store);
    }

    // All artifact event triples
    await jsonldPrint(dn_event['_body'],url,store);

    // Move to the service node
    const actor = dn_event['actor'];
  
    if (actor) {
        await turtlePrint(`<${url}> ev:actor <${actor}> .`,null,store);
        await _crawlEvent_ServiceNode(artifact, actor, store);
    }
}

async function _crawlEvent_ServiceNode(artifact,url,store) {
    if (artifact && url) {
        // ok
    }
    else {
        return;
    }

    await turtlePrint(`<${url}> a ev:ServiceNode .`,null,store);
    
    const sn_log = await discoverLog(url,artifact);

    if (!sn_log) {
        return;
    }

    // Add metadata
    await turtlePrint(`<${url}> ev:eventlog <${sn_log}> .`,null,store);
    
    const sn_events = await listEvents(sn_log);
    
    for (let i = 0 ; i < sn_events.length ; i++) {
        await turtlePrint(`
<${artifact}> ev:hasEvent <${sn_events[i]}> .
<${sn_events[i]}> a ev:Event , ev:ServiceNodeEvent .
`,null,store);
        await _crawlEvent(artifact,sn_events[i],store);
    }
}

async function _crawlEvent_ArchiveNode(eventlog,store) {
    // Fetch the Mementos of the Event Log
    const mementos = await listEventMementos(eventlog);

    if (! mementos) {
        return;
    }

    for (let i = 0 ; i < mementos.length ; i++) {
        const memento = mementos[i]['memento'];

         await turtlePrint(`
<${eventlog}> iana:memento <${memento}> .
<${mementos[i]['memento']}> dc:created "${mementos[i]['datetime']}" .
`,null,store);

        const memento_jsonld = await fetchJsonLD(memento);

        if (memento_jsonld) {
            await jsonldPrint(memento_jsonld,memento,store);
        }
    }
}

async function turtlePrint(rdf,graph,store) {
    await printAsQuads(`
@prefix as: <https://www.w3.org/ns/activitystreams#> .
@prefix ev: <https://www.eventnotifications.net/ns#> .
@prefix iana: <http://www.iana.org/assignments/relation/> .
@prefix dataid: <http://dataid.dbpedia.org/ns/core#> .
@prefix dc: <http://purl.org/dc/terms/> .
@prefix ldes: <https://w3id.org/ldes#> .
@prefix tree: <https://w3id.org/tree#> .
@prefix notify: <https://purl.org/coar/notify_vocabulary/> .
@prefix schema: <http://schema.org/> .
${rdf}
`,graph,'file.ttl',store);
}

async function jsonldPrint(rdf,graph,store) {
    await printAsQuads(rdf,graph,'file.jsonld',store);
}

async function printAsQuads(rdf, url, path, store) {
    const fileType = path ? path : 'file.jsonld' ;
    const namedNode = N3.DataFactory.namedNode;
    const quad = N3.DataFactory.quad;
    const defaultGraph = N3.DataFactory.defaultGraph;

    return new Promise( (resolve,reject) => { 
        try {
            const textStream = require('streamify-string')(rdf);

            rdfParser.parse(textStream, { path: fileType })
                .on('data', (q) => {
                    store.add(
                        quad(
                        q.subject,
                        q.predicate,
                        q.object,
                        url ? namedNode(url) : defaultGraph()
                        )
                    );
                })
                .on('error', (error) => {
                    reject(error);
                })
                .on('end', () => { resolve(true) });
        }
        catch(e) {
            reject(e);
        }
    });
}

async function printN3Store(store,format) {
    return new Promise( (resolve,reject) => {
        const writer = new N3.Writer({ 
            format: format ?? 'TriG' ,
            prefixes: {
                as: 'https://www.w3.org/ns/activitystreams#',
                ev: 'https://www.eventnotifications.net/ns#' ,
                notify: 'https://purl.org/coar/notify_vocabulary/' ,
                tree: 'https://w3id.org/tree#',
                ldes: 'https://w3id.org/ldes#',
                iana: 'http://www.iana.org/assignments/relation/' ,
                dataid: 'http://dataid.dbpedia.org/ns/core#',
                dc: 'http://purl.org/dc/terms/',
                schema: 'http://schema.org/',
            }
        });

        for (const quad of store) {
            writer.addQuad(quad);
        }

        writer.end((error, result) => {
            if (error) {
                console.error(error);
                reject(error);
            }
            resolve(result);
        });
    });
}

async function canonizeEvent(jsonld) {
    return new Promise( async(resolve,reject) =>  {
        try {
            const textStream = require('streamify-string')(jsonld);

            const dataset = [];

            rdfParser.parse(textStream, { path: 'file.jsonld' })
                .on('data', (quad) => {
                    dataset.push(quad);
                })
                .on('error', (error) => reject(error))
                .on('end', async () => {
                    const canonical = await canonize.canonize(dataset, {algorithm: 'RDFC-1.0'});
                    resolve(canonical);
                });
        }
        catch (e) {
            reject(error);
        }
    });
}

async function fetchHeaders(url) {
    try {
        const result = await fetch(url, {
            method: 'HEAD'
        });

        if (!result.ok) {
            return null;
        }

        return result.headers;
    }
    catch (e) {
        return null;
    }
}

async function fetchJsonLD(url) {
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

        return body;
    }
    catch (e) {
        return null;
    }
}

function sha256(data) {
    return createHash('sha256').update(data).digest('base64');
}

module.exports = { 
    discoverLog, 
    listEvents, 
    getEvent, 
    canonizeEvent, 
    listEventMementos, 
    crawlEvent,
    printN3Store, 
    sha256 
};