# eventlog-cli

An experimental command line client for the [Event Notifications](https://www.eventnotifications.net) extension: Event Logs.

## install

```
yarn install
```

Optional an installation of the [EYE](https://github.com/eyereasoner/eye) reasoner is required to evaluate crawled event logs.

## usage

```
# start the demonstration web server
yarn run server

# discover the Event Log for the artifact http://localhost:8000/data_node/artifact.html
$ ./bin/eventlog-cli.js where http://localhost:8000/data_node/artifact.html
http://localhost:8000/data_node/eventlog.jsonld

# list all event log entries for the Event Log http://localhost:8000/data_node/eventlog.jsonld
$ ./bin/eventlog-cli.js list http://localhost:8000/data_node/eventlog.jsonld
[
  "http://localhost:8000/data_node/event1.jsonld"
]

# show the details of the event entry http://localhost:8000/data_node/event1.jsonld
$ ./bin/eventlog-cli.js get http://localhost:8000/data_node/event1.jsonld
{
  "id": "urn:uuid:1-4",
  "type": "https://purl.org/coar/notify_vocabulary/EndorsementAction",
  "actor": "http://localhost:8000/service_node/card.ttl",
  "object": "http://localhost:8000/service_node/review.html",
  "context": "http://localhost:8000/data_node/artifact.html",
  "sha256": "Cq3QsXoV5JNGIzsOlqoCxLtv3uGL9Ho4et3xPkNHdMU="
}

# discover for actor http://localhost:8000/service_node/card.ttl 
# an event log for the artifact http://localhost:8000/data_node/artifact.html
$ ./bin/eventlog-cli.js where --for http://localhost:8000/service_node/card.ttl http://localhost:8000/data_node/artifact.html
http://localhost:8000/service_node/eventlog.jsonld

# list all events for http://localhost:8000/service_node/eventlog.jsonld
$ ./bin/eventlog-cli.js list-all http://localhost:8000/service_node/eventlog.jsonld
[
  {
    "id": "urn:uuid:1-4",
    "type": "https://purl.org/coar/notify_vocabulary/EndorsementAction",
    "actor": "http://localhost:8000/service_node/card.ttl",
    "object": "http://localhost:8000/service_node/review.html",
    "context": "http://localhost:8000/data_node/artifact.html",
    "sha256": "Cq3QsXoV5JNGIzsOlqoCxLtv3uGL9Ho4et3xPkNHdMU="
  },
  {
    "id": "urn:uuid:1-5",
    "type": "https://www.w3.org/ns/activitystreams#Reject",
    "actor": "http://localhost:8000/service_node/card.ttl",
    "object": "urn:uuid:1-4",
    "context": "http://localhost:8000/data_node/artifact.html",
    "sha256": "5ozL7MTdU2GIrWOBEmd3uriuk8jsssNq20pBVnKA1eU="
  }
]

# list all mementos for http://localhost:8000/service_node/eventlog.jsonld
$ ./bin/eventlog-cli.js list-mementos http://localhost:8000/service_node/eventlog.jsonld
[
  {
    "memento": "http://localhost:8000/archive/web/20240320180259/service_node/eventlog.jsonld",
    "datetime": "2024-03-20T18:02:59.000Z"
  },
  {
    "memento": "http://localhost:8000/archive/web/20240321203051/service_node/eventlog.jsonld",
    "datetime": "2024-03-21T20:30:51.000Z"
  }
]

# crawl the web for artifact http://localhost:8000/data_node/artifact.html
# and receive information about its event log, related service node event logs
# and mementos of the event log
$ ./bin/eventlog-cli.js crawl http://localhost:8000/data_node/artifact.html > demo/crawl.n3

# Test the crawled data for authenticity and completeness
$ ./bin/test-crawl.sh demo/crawl.n3
@prefix test: <https://example.org/ns#>.

<http://localhost:8000/data_node/event1.jsonld> test:authentic true.
```

## environmental variables

- `LOG4JS` : set to `info`, `debug`, `error` to receive logging information

## event log

An event log is a listing of [Event Notifications](https://www.eventnotifications.net) related at a (scholarly) artifact. The event log is serialized as a [LDES](https://semiceu.github.io/LinkedDataEventStreams/) in JSON-LD.

An example of a log:

```
{
  "@context": "https://labs.eventnotifications.net/contexts/eventlog.jsonld",
  "id": "https://mycontributions.info/service/e/trace?artifact=latest",
  "type": "EventLog",
  "artifact": "http://localhost:8000/data_node/artifact.html",
  "member": [
      "http://localhost:8000/service_node/event1.jsonld",
      "http://localhost:8000/service_node/event2.jsonld"
  ]
}
```

Event logs can optionally contain metadata about the referenced event notifications:

```
{
  "@context": "https://labs.eventnotifications.net/contexts/eventlog.jsonld",
  "id": "https://mycontributions.info/service/e/trace?artifact=latest",
  "type": "EventLog",
  "artifact": "http://localhost:8000/data_node/artifact.html",
  "member": [
    {
      "id": "http://localhost:8000/service_node/event1.jsonld",
      "created": "2024-09-18T11:26:57.688Z",
      "checksum": {
        "type": "Checksum",
        "algorithm": "spdx:checksumAlgorithm_md5",
        "checksumValue": "30bf8cc40272be1239c40f7b9f950d7d"
      }
    }
    {
      "id": "http://localhost:8000/service_node/event2.jsonld",
      "created": "2024-09-18T11:26:57.703Z",
      "checksum": {
        "type": "Checksum",
        "algorithm": "spdx:checksumAlgorithm_md5",
        "checksumValue": "4e299d9468e8a77cbf6b92910852ddac"
      }
    }
  ]
}
```

## Event log discovery

### Link-Template rel=eventlog HTTP header

Given an artifact at a data node the event log can be discovered by reading the `Link-Template` header with a `rel=eventlog` relation:

```
Link-Template: "http://localhost:8000/data_node/eventlog.jsonld ; rel="eventlog"
```

Given a service node, the event log for a particular artifact can be found by reading the `Link-Template` header from a service node entry page (the homepage, the profile page). When a `{url}` is present in the template the artifact url should be filled in:

```
Link-Template: "https://mycontributions.info/service/e/trace?artifact={url}" ; rel="eventlog"
```

### IETF link-template RDF property

Given an artifact or service node the event log can be found by requesting an RDF representation of the resource and executing the SPARQL query:

```
PREFIX ietf: <http://www.iana.org/assignments/relation/>

SELECT ?template {
    <url> ietf:link-template ?template.
}
```

where `<url>` is the URL of the artifact or service node.

## Link rel=eventlog_catalog HTTP header

Given an artifact URL the event log can be discovered by reading for a service node the `Link` header with a `rel=eventlog_catalog` relation:

```
Link: <http://localhost:8000/demo_node/catalog.json> ; rel="eventlog_catalog"
```

The `catalog.json` should be a JSON document containing a listing of all (locally) known event logs for an artifact:

```
{
  "member" : [
    {
      "id": "http://localhost:8000/eventlog1.jsonld",
      "artifact": "http://localhost:8000/artifact1.jsonld"
    },
    {
      "id": "http://localhost:8000/eventlog2.jsonld",
      "artifact": "http://localhost:8000/artifact2.jsonld"
    }
  ]
}
```

The event log can be read from this JSON file by comparing it with the matching artifact.

## Event Notifications eventlog_catalog RDF property

Given an artifact or service node the event log can be found by requesting an RDF representation of the resource and executing the SPARQL query:

```
PREFIX ev: <https://www.eventnotifications.net/ns#>

SELECT ?catalog {
    <url> ev:eventlog_catalog ?catalog .
}
```

where `<url>` is the URL of the artifact or service node. At the `?catalog` should contain the URL of a JSON catalog, as explained in the previous section.

## see also

https://labs.eventnotifications.net