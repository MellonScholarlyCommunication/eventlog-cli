# eventlog-cli

An experimental command line client for the [Event Notifications](https://www.eventnotifications.net) extension: Event Logs.

## install

```
yarn install
```

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

# crawl the web for an event log entry http://localhost:8000/data_node/event1.jsonld
# for artifact http://localhost:8000/data_node/artifact.html
$ ./bin/eventlog-cli.js crawl http://localhost:8000/data_node/artifact.html http://localhost:8000/data_node/event1.jsonld > demo/crawl.n3
```

## see also

https://labs.eventnotifications.net