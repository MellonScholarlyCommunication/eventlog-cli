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
    const eventlog = await discoverLog(artifact);

    if (!eventlog) {
        return;
    }

    // Add some metadata
    await turtlePrint(`
<${artifact}>
  a ev:Artifact ;
  iana:eventlog <${eventlog}> ;
  ev:hasEvent <${url}> .

<${url}>
  a ev:Event , ev:DataNodeEvent .
`);

    await _crawlEvent(artifact,url);

    // Fetch the Event Log JSON-LD
    const eventlog_jsonld = await fetchJsonLD(eventlog);

    if (eventlog_jsonld) {
        await jsonldPrint(eventlog_jsonld,eventlog);
    }

    // Fetch the Mementos of the Event Log
    const mementos = await listEventMementos(eventlog);

    if (mementos) {
        for (let i = 0 ; i < mementos.length ; i++) {
            turtlePrint(`
<${eventlog}> iana:memento <${mementos[i]['memento']}> .
<${mementos[i]['memento']}> dc:created "${mementos[i]['datetime']}" .
`);

            const memento_jsonld = await fetchJsonLD(mementos[i]['memento']);

            if (memento_jsonld) {
                await jsonldPrint(memento_jsonld,mementos[i]['memento']);
            }
        }
    }
}

const CRAWL_SEEN = {};

async function _crawlEvent(artifact,url) {
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
        await turtlePrint(`<${url}> dataid:checksum "${canonical_256}" .`);
    }

    // All artifact event triples
    await jsonldPrint(dn_event['_body'],url);

    // Move to the service node
    const actor = dn_event['actor'];
  
    if (actor) {
        await turtlePrint(`<${url}> ev:actor <${actor}> .`);
        await _crawlEvent_ServiceNode(artifact, actor);
    }
}

async function _crawlEvent_ServiceNode(artifact,url) {
    if (artifact && url) {
        // ok
    }
    else {
        return;
    }

    await turtlePrint(`<${url}> a ev:ServiceNode .`);
    
    const sn_log = await discoverLog(url,artifact);

    if (!sn_log) {
        return;
    }

    // Add metadata
    await turtlePrint(`<${url}> iana:eventlog <${sn_log}> .`);
    
    const sn_events = await listEvents(sn_log);
    
    for (let i = 0 ; i < sn_events.length ; i++) {
        await turtlePrint(`
<${artifact}> ev:hasEvent <${sn_events[i]}> .
<${sn_events[i]}> a ev:Event , ev:ServiceNodeEvent .
`);
        await _crawlEvent(artifact,sn_events[i]);
    }
}

async function turtlePrint(rdf,graph) {
    await printAsQuads(`
@prefix ev: <https://www.eventnotifications.net/ns#> .
@prefix iana: <http://www.iana.org/assignments/relation/> .
@prefix dataid: <http://dataid.dbpedia.org/ns/core#> .
@prefix dc: <http://purl.org/dc/terms/> .
${rdf}
`,graph,'file.ttl');
}

async function jsonldPrint(rdf,graph) {
    await printAsQuads(rdf,graph,'file.jsonld');
}

async function printAsQuads(rdf, url, path) {
    const fileType = path ? path : 'file.jsonld' ;
    const writer = new N3.Writer({ 
        format: 'TriG' 
    });
    const namedNode = N3.DataFactory.namedNode;
    const quad = N3.DataFactory.quad;
    const defaultGraph = N3.DataFactory.defaultGraph;

    try {
        const textStream = require('streamify-string')(rdf);

        const dataset = [];

        rdfParser.parse(textStream, { path: fileType })
            .on('data', (q) => {
                writer.addQuad(
                    quad(
                       q.subject,
                       q.predicate,
                       q.object,
                       url ? namedNode(url) : defaultGraph()
                    )
                );
            })
            .on('error', (error) => {
                console.error(`${error}`);
                return;
            })
            .on('end', () => {
                writer.end((error, result) => console.log(result));
            });
    }
    catch(e) {
        console.error(`failed to print : ${rdf}`);
        console.error(e);
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

module.exports = { discoverLog, listEvents , getEvent , canonizeEvent , listEventMementos , crawlEvent , sha256 };