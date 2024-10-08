const fetch = require('node-fetch');
const { backOff } = require('exponential-backoff'); 
const LinkHeader = require('http-link-header');
const cheerio = require('cheerio');
const canonize = require('rdf-canonize');
const rdfParser = require('rdf-parse').default;
const N3 = require('n3');
const Memento = require('memento-cli');
const log4js = require('log4js');
const md5 = require('md5');
const QueryEngine = require('@comunica/query-sparql').QueryEngine;
const { createHash } = require('crypto');

const logger = log4js.getLogger();
const myEngine = new QueryEngine();

if (process.env.LOG4JS) {
    log4js.configure({
        appenders: {
          stderr: { type: 'stderr' }
        },
        categories: {
          default: { appenders: ['stderr'], level: process.env.LOG4JS }
        }
    });
}

const EVENT_LOG_RELATION = [
    'eventlog',
    'https://w3id.org/ldes#EventStream'
];

async function discoverLog(url,artifact) {
    if (! artifact) {
        let log = await discoverLinkTemplateLog(url,url);

        if (log) {
            return log;
        }
    }

    if (artifact) {
        log = await discoverLinkTemplateLog(url,artifact);

        if (log) {
            return log;
        }

        log = await discoverCatalogLog(url,artifact);

        if (log) {
            return log;
        }
    }

    return null;
}

async function discoverLinkTemplateLog(url,artifact) {
    let res = await discoverLinkTemplateLogHeader(url,artifact);

    if (!res) {
        res = await discoverLinkTemplateLogInline(url,artifact);
    }

    return res;
}

async function discoverLinkTemplateLogHeader(url,artifact) {
    try {
        logger.info(`discoverLinkTemplateLogHeader(${url},${artifact})`);

        const headers = await fetchHeaders(url);

        if (!headers) {
            logger.error(`no headers found`);
            return null;
        }

        const linkTemplateHeader = headers.get('link-template');

        if (linkTemplateHeader) {
            logger.debug(`found link-template header: ${linkTemplateHeader}`);
            const log = parseLinkTemplate(linkTemplateHeader,artifact);

            if (log) {
                return log;
            }
        }
        else {
            logger.warn(`no link-template header for ${url}`);
        }
        
        return null;
    }
    catch (e) {
        logger.error(e);
        return null;
    }
}

async function discoverLinkTemplateLogInline(url,artifact) {
    try {
        logger.info(`discoverLinkTemplateLogInline(${url},${artifact})`);

        const result = await queryRDF(url,`
PREFIX ietf: <http://www.iana.org/assignments/relation/>

SELECT ?template {
    <${url}> ietf:link-template ?template.
}
`);

        if (result && result.length > 0) {
            const template = result[0].get('template').value;
            if (artifact) {
                return template.replace(/{[^}]+}/,artifact);
            }
            else {
                return template;
            }
        }
        else {
            logger.warn('nope nothing found');
        }

        return null;
    }
    catch (e) {
        logger.error(e);
        return null;
    }
}

function parseLinkTemplate(template,artifact) {
    logger.info(`parseLinkTemplate(${template},${artifact})`);

    for (let i = 0 ; i < EVENT_LOG_RELATION.length ; i++) {
        const rel = EVENT_LOG_RELATION[i];
        const regex = new RegExp(`"([^"]+)"\\s+;\\s+rel="${rel}"`);
        const match = regex.exec(template);

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

    return null;
}

async function discoverCatalogLog(url,artifact) {
    let res = await discoverCatalogLogHeader(url,artifact);

    if (!res) {
        res = await discoverCatalogLogInline(url,artifact);
    }

    return res;
}

async function discoverCatalogLogHeader(url,artifact) {
    try {
        logger.info(`discoverCatalogLogHeader(${url},${artifact})`);

        const headers = await fetchHeaders(url);

        if (!headers) {
            logger.error(`no headers found`);
            return null;
        }

        const linkHeader = headers.get('link');

        if (linkHeader) {
            const parsedLinkHeaders = LinkHeader.parse(linkHeader); 

            const catalog = parsedLinkHeaders.get('rel','eventlog_catalog');

            if (catalog && catalog.length > 0) {
                return await parseCatalog(catalog[0]['uri'],artifact);  
            }
            else {
                logger.warn(`no eventlog_catalog link headers found for ${url}`);
            }
        }
        else {
            logger.warn(`no link headers found for ${url}`);
        }

       
    }
    catch (e) {
        logger.error(e);
        return null;
    }
}

async function discoverCatalogLogInline(url,artifact) {
    try {
        logger.info(`discoverCatalogLogInline(${url},${artifact})`);

        const result = await queryRDF(url,`
PREFIX ev: <https://www.eventnotifications.net/ns#>

SELECT ?catalog {
    <${url}> ev:eventlog_catalog ?catalog .
}
`);

        if (result && result.length > 0) {
            const catalog = result[0].get('catalog').value;
            return await parseCatalog(catalog,artifact); 
        }
        else {
            logger.warn(`nope nothing found`);
        }

        return null;
    }
    catch (e) {
        logger.error(e);
        return null;
    }
}

async function parseCatalog(url,artifact) {
    try {
        logger.info(`parseCatalog(${url},${artifact})`);

        const jsonld = await fetchJsonLD(url);

        if (!jsonld) {
            logger.info(`no events for ${url}`);
            return [];
        }

        const data = JSON.parse(jsonld);

        if (data && data['member']) {
            for (let i = 0 ; i < data['member'].length ; i++ ) {
                const entry = data['member'][i];
      
                if (entry && entry['id'] && entry['artifact'] && entry['artifact'] === artifact) {
                    return entry['id'];
                }
            }
        }

        logger.warn(`no catalog entry found for ${artifact}`);
        return null;
    }
    catch (e) {
        logger.error(e);
        return null;
    }
}

async function listEvents(url) {
    logger.info(`listEvents(${url})`);
    try {
        const jsonld = await fetchJsonLD(url);

        if (!jsonld) {
            logger.info(`no events for ${url}`);
            return [];
        }

        const data = JSON.parse(jsonld);

        if (data && data['member']) {
            if (typeof data['member'] === 'string' || data['member'] instanceof String) {
                return [data['member']];
            }
            else {
                return data['member'];
            }
        }
    }
    catch (e) {
       logger.error(e);
       return [];
    }
}

async function getEvent(url) {
    logger.info(`getEvent(${url})`);
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
        logger.error(e);
        return null;
    }
}


async function eventDetails(url) {
    const event = await getEvent(url);
    if (! event) {
      return { [url] : {} };
    }
    const canonical = await canonizeEvent(event['_body']);
    const canonicalSha256 = sha256(canonical);
    const canonicalMD5 = md5(canonical);
    const bodySha256 = sha256(event['_body']);
    const bodyMD5 = md5(event['_body']);
    event['checksum'] = [
        {
            type: [ "Checksum" , "Canonical" ],
            algorithm: "spdx:checksumAlgorithm_sha256",
            checksumValue: canonicalSha256
        },
        {
            type: [ "Checksum" , "Canonical" ],
            algorithm: "spdx:checksumAlgorithm_md5",
            checksumValue: canonicalMD5
        }, 
        {
            type: [ "Checksum" , "Raw" ],
            algorithm: "spdx:checksumAlgorithm_sha256",
            checksumValue: bodySha256
        }, 
        {
            type: [ "Checksum" , "Raw" ],
            algorithm: "spdx:checksumAlgorithm_md5",
            checksumValue: bodyMD5
        },  
    ];
    delete event['_body'];
    return { [url] : event };
}

async function listEventMementos(url) {
    logger.info(`listEventMementos(${url})`);
    try {

        const headers = await fetchHeaders(url);

        const linkHeader = headers.get('link');

        if (linkHeader) {
            logger.debug(`found link header: ${linkHeader}`);
        }
        else {
            logger.warn(`no link header for ${url} (need rel=timemap)`);
            return [];
        }
        
        const parsedLinkHeaders = LinkHeader.parse(linkHeader);

        if (!parsedLinkHeaders.get('rel','timemap')) {
            logger.error(`no timemap header for ${url}`);
            return [];
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
        logger.error(e);
        return [];
    }
}

async function crawlEvent(url,artifact) {
    if (artifact) {
        logger.info(`crawlEvent(${artifact})`);
    }
    else {
        logger.info(`crawlEvent(${url},${artifact})`);
    }

    const store = new N3.Store();

    let eventlog; 

    if (artifact) {
        eventlog = await discoverLog(url,artifact);
    }
    else {
        eventlog = await discoverLog(artifact);
    }

    if (!eventlog) {
        logger.error(`no event log found for ${artifact}`);
        return;
    }

    // Add some metadata
    await turtlePrint(`
<${artifact}>
    a ev:Artifact ;
    ev:eventlog <${eventlog}>.
`,null,store);

    const events = await listEvents(eventlog);

    if (events) {
        for (let i = 0 ; i < events.length; i++) {
            let url;
            
            if (typeof events[i] === 'string' || events[i] instanceof String) {
                url = events[i];
            }
            else if (events[i].id) {
                url = events[i].id;
            }
            else if (events[i]['@id']) {
                url = events[i]['@id'];
            }
            else {
                logger.error(`event has no id?`);
                logger.debug(events[i]);
                continue;
            }

            // Add some metadata
            await turtlePrint(`
<${artifact}> ev:hasEvent <${url}> .
<${url}> a ev:Event , ev:DataNodeEvent .
`,null,store);

            await _crawlEvent(artifact,url,store);
        }
    }

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
        console.error(`need artifact and url`);
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
        logger.debug(`processing service node for ${url}`);
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
    logger.debug(`processing archive node for ${eventlog}`);

    // Fetch the Mementos of the Event Log
    const mementos = await listEventMementos(eventlog);

    if (! mementos) {
        logger.warn(`no mementos found for ${eventlog}`);
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
        else {
            logger.warn(`no json-ld found for ${memento}`);
        }
    }
}

async function turtlePrint(rdf,graph,store) {
    await storeRDF(`
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
    await storeRDF(rdf,graph,'file.jsonld',store);
}

async function storeRDF(rdf, url, path, store) {
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
                    logger.error(error);
                    reject(error);
                })
                .on('end', () => { resolve(true) });
        }
        catch(e) {
            logger.error(e);
            reject(e);
        }
    });
}

async function printN3Store(store,format) {
    if (!store) {
        return undefined;
    }
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
                logger.error(error);
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
                .on('error', (error) => {
                    logger.error(error);
                    reject(error);
                })
                .on('end', async () => {
                    const canonical = await canonize.canonize(dataset, {algorithm: 'RDFC-1.0'});
                    resolve(canonical);
                });
        }
        catch (e) {
            logger.error(error);
            reject(error);
        }
    });
}

async function fetchHTMLLinks(url) {
    try {
        logger.debug(`fetchHTML(${url})`);
        const result = await backOff_fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'text/html'
            }
        });

        if (!result.ok) {
            logger.error(`fetch GET {url} failed : (${result.status}) ${result.statusText}`);
            return null;
        }

        const html = await result.text();

        const $ = cheerio.load(html);

        const links = [];
        $('link').each((i,node) => {
            const rel = $(node).attr('rel');
            const href = $(node).attr('href');
            links.push( { rel: rel , href: href });
        });

        return links;
    }
    catch (e) {
        logger.error(e);
        return null;
    }
}

async function fetchHeaders(url) {
    try {
        logger.debug(`fetchHeaders(${url})`);
        const result = await backOff_fetch(url, {
            method: 'HEAD'
        });

        if (!result.ok) {
            logger.error(`fetch HEAD ${url} failed : (${result.status}) ${result.statusText}`);
            return null;
        }

        return result.headers;
    }
    catch (e) {
        logger.error(e);
        return null;
    }
}

async function queryRDF(url,query) {
    try { 
        const bindingsStream = await myEngine.queryBindings(query, {
            sources: [url]
        });
        const bindings = await bindingsStream.toArray();
        return bindings;
    }
    catch (e) {
        logger.error(e);
        return null;
    }
}

async function fetchJsonLD(url) {
    try {
        logger.debug(`fetchJsonLD(${url})`);
        const result = await backOff_fetch(url, {
            method: 'GET',
            headers: {
                'accept': 'application/ld+json'
            }
        });

        if (! result.ok) {
            logger.error(`fetch GET ${url} failed : (${result.status}) ${result.statusText}`);
            return null;
        }

        const body = await result.text();

        return body;
    }
    catch (e) {
        logger.error(e);
        return null;
    }
}

async function backOff_fetch(url,options) {
    return await backOff( () => fetch(url,options) , {
        retry: (e,attempt) => {
            logger.warn(`attempt ${attempt} on ${url}`);
            return true;
        }
    });
}

function sha256(data) {
    return createHash('sha256').update(data).digest('base64');
}

module.exports = { 
    discoverLog, 
    discoverCatalogLog,
    listEvents, 
    getEvent, 
    eventDetails,
    canonizeEvent, 
    listEventMementos, 
    crawlEvent,
    printN3Store, 
    sha256 
};