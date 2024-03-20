# eventlog-cli

An experimental command line client for the [Event Notifications](https://www.eventnotifications.net) extension: Event Logs.

## usage

```
# start the demonstration web server
yarn run server

# discover the Event Log for the artifact http://localhost:8000/artifact.html
$ ./bin/eventlog-cli.js where http://localhost:8000/artifact.html
http://localhost:8000/eventlog.ttl

# list all event log entries for the Event Log http://localhost:8000/eventlog.ttl
$ ./bin/eventlog-cli.js list http://localhost:8000/eventlog.ttl
[
  "http://localhost:8000/event1.jsonld"
]

# show the details of the event entry http://localhost:8000/event1.jsonld
$ ./bin/eventlog-cli.js get http://localhost:8000/event1.jsonld
{
  "id": "urn:uuid:1-4",
  "type": "https://purl.org/coar/notify_vocabulary/EndorsementAction",
  "actor": "http://localhost:8000/service/card.ttl",
  "object": "http://localhost:8000/service/review.html",
  "context": "http://localhost:8000/artifact.html",
  "sha256": "Cq3QsXoV5JNGIzsOlqoCxLtv3uGL9Ho4et3xPkNHdMU="
}

# show for actor http://localhost:8000/service/card.ttl the event log http://localhost:8000/artifact.html
./bin/eventlog-cli.js where --for http://localhost:8000/service/card.ttl http://localhost:8000/artifact.html
http://localhost:8000/service/eventlog.ttl
```

## see also

https://labs.eventnotifications.net